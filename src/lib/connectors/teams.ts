/**
 * Microsoft Teams connector, promoted from v1.1 into v1.
 *
 * Reads posts from one or more Teams channels and normalizes them into
 * {@link SourceEvent}s (all `comment` kind, channel posts carry chatter and
 * announcements, not task state).
 *
 * Microsoft has a two-level structure, an account holds teams, a team holds
 * channels, so the connector maps a team to a workspace and a channel to a
 * "project". A connection's `projectIds` entries each carry a
 * `teamId|channelId` composite (a team id is a GUID and a channel id starts
 * with `19:`, neither contains a `|`) so a single id locates the channel
 * without a separate stored field. The connection schema splits each id back
 * into a `{teamId, channelId}` pair before handing it to this connector.
 *
 * Auth is app-only: the deployer pastes an Entra app's tenant/client/secret and
 * the connector mints its own Microsoft Graph tokens, see `teams-oauth.ts`.
 */

import { z } from 'zod';

import { assertWindow, fetchWithRetry, inWindow } from './http-core';
import { mintAccessToken } from './teams-oauth';
import {
  ConnectorError,
  type ActivityDigest,
  type Connector,
  type ConnectorIdentity,
  type ConnectorWindow,
  type ConnectorWorkspace,
  type SourceEvent,
} from './types';

const SOURCE = 'teams' as const;
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const PAGE_LIMIT = 50;
const MAX_PAGES = 20;
/** Per-message detail cap, keeps a digest of a chatty channel prompt-sized. */
const MESSAGE_DETAIL_LIMIT = 1000;
/** Joins a team id and channel id into a single `projectId`. */
const TARGET_SEPARATOR = '|';

/** One Teams channel target, split from a `teamId|channelId` composite. */
export interface TeamsTarget {
  teamId: string;
  channelId: string;
}

export interface TeamsConnectorConfig {
  /** Microsoft Entra app-only credentials, the connector mints tokens from these. */
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** The Teams channels this connector tracks. Required by `fetchActivity`. */
  targets?: readonly TeamsTarget[];
  /** Injectable fetch, defaults to the global. Override in tests. */
  fetch?: typeof fetch;
}

/** A connectable Teams channel, surfaced as the connector's "project". */
export interface TeamsChannel {
  /** A `teamId|channelId` composite, see the module docstring. */
  id: string;
  name: string;
}

export interface TeamsConnector extends Connector {
  /** The tenant's teams, each is a connectable workspace. */
  listWorkspaces(): Promise<ConnectorWorkspace[]>;
  /** A team's channels, each is a connectable "project". */
  listProjects(workspaceId: string): Promise<TeamsChannel[]>;
}

/** Splits a `teamId|channelId` composite back into its parts. */
export function splitTeamsTarget(projectId: string): { teamId: string; channelId: string } {
  const sep = projectId.indexOf(TARGET_SEPARATOR);
  if (sep === -1) return { teamId: '', channelId: projectId };
  return { teamId: projectId.slice(0, sep), channelId: projectId.slice(sep + 1) };
}

// --- Graph API schemas (boundary validation) -------------------------------

const teamSchema = z.object({ id: z.string(), displayName: z.string().optional() });

const channelSchema = z.object({ id: z.string(), displayName: z.string().optional() });

const messageSchema = z.object({
  id: z.string(),
  messageType: z.string().optional(),
  createdDateTime: z.string().optional(),
  deletedDateTime: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  webUrl: z.string().optional(),
  body: z
    .object({ contentType: z.string().optional(), content: z.string().optional() })
    .optional(),
  from: z
    .object({
      user: z
        .object({ displayName: z.string().nullable().optional() })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

type TeamsMessage = z.infer<typeof messageSchema>;


// --- Connector -------------------------------------------------------------

export function createTeamsConnector(config: TeamsConnectorConfig): TeamsConnector {
  const doFetch = config.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new ConnectorError(SOURCE, 'config', 'No fetch implementation is available.');
  }
  const tenantId = config.tenantId?.trim();
  const clientId = config.clientId?.trim();
  const clientSecret = config.clientSecret?.trim();
  if (!tenantId || !clientId || !clientSecret) {
    throw new ConnectorError(SOURCE, 'config', 'Microsoft Entra app credentials are required.');
  }

  // The Graph token is minted lazily from the app credentials and cached for
  // this connector instance, one operation, well inside the token's lifetime.
  let cachedToken: string | undefined;
  async function getToken(): Promise<string> {
    if (cachedToken) return cachedToken;
    try {
      cachedToken = await mintAccessToken({ tenantId, clientId, clientSecret }, { fetch: doFetch });
    } catch (cause) {
      throw new ConnectorError(SOURCE, 'auth', 'Microsoft rejected the app credentials.', {
        cause,
      });
    }
    return cachedToken;
  }

  async function rawRequest(urlOrPath: string): Promise<unknown> {
    const url = urlOrPath.startsWith('http') ? urlOrPath : `${GRAPH_BASE}${urlOrPath}`;
    const token = await getToken();
    const res = await fetchWithRetry(SOURCE, 'Microsoft Graph', () =>
      doFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }),
    );

    if (res.ok) {
      try {
        return await res.json();
      } catch (cause) {
        throw new ConnectorError(
          SOURCE,
          'bad_response',
          'Microsoft Graph returned an unreadable response.',
          { cause },
        );
      }
    }
    if (res.status === 401 || res.status === 403) {
      throw new ConnectorError(
        SOURCE,
        'auth',
        'Microsoft Graph denied access, check the app permissions and admin consent.',
        { status: res.status },
      );
    }
    if (res.status === 404) {
      throw new ConnectorError(SOURCE, 'not_found', 'The Teams resource was not found.', {
        status: 404,
      });
    }
    if (res.status === 429) {
      throw new ConnectorError(SOURCE, 'rate_limited', 'Microsoft Graph rate limit exceeded.', {
        status: 429,
      });
    }
    throw new ConnectorError(SOURCE, 'unknown', `Microsoft Graph request failed (${res.status}).`, {
      status: res.status,
    });
  }

  async function request<T extends z.ZodTypeAny>(urlOrPath: string, schema: T): Promise<z.infer<T>> {
    const json = await rawRequest(urlOrPath);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ConnectorError(
        SOURCE,
        'bad_response',
        'Microsoft Graph response did not match the expected shape.',
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }

  /**
   * Fetches one Graph collection page, the raw `value[]` plus `@odata.nextLink`.
   * Deliberately un-typed and non-generic: a generic `z.infer` folded over a
   * built page object trips the compiler's circularity guard, so each caller
   * parses `value` itself against a concrete item schema.
   */
  async function fetchCollection(
    urlOrPath: string,
  ): Promise<{ value: unknown[]; nextLink: string | undefined }> {
    const json = await rawRequest(urlOrPath);
    if (typeof json !== 'object' || json === null) {
      throw new ConnectorError(SOURCE, 'bad_response', 'Microsoft Graph returned an unexpected response.');
    }
    const body = json as Record<string, unknown>;
    const link = body['@odata.nextLink'];
    return {
      value: Array.isArray(body.value) ? body.value : [],
      nextLink: typeof link === 'string' ? link : undefined,
    };
  }

  /** Parses a collection page's `value[]` against an item schema. */
  function parseItems<T extends z.ZodTypeAny>(value: unknown[], item: T): z.infer<T>[] {
    const parsed = z.array(item).safeParse(value);
    if (!parsed.success) {
      throw new ConnectorError(
        SOURCE,
        'bad_response',
        'Microsoft Graph response did not match the expected shape.',
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }

  /** Follows `@odata.nextLink` and collects every item across pages. */
  async function paginateAll<T extends z.ZodTypeAny>(
    firstPath: string,
    item: T,
  ): Promise<z.infer<T>[]> {
    const items: z.infer<T>[] = [];
    let url: string | undefined = firstPath;
    let pages = 0;
    while (url && pages < MAX_PAGES) {
      const page = await fetchCollection(url);
      items.push(...parseItems(page.value, item));
      url = page.nextLink;
      pages += 1;
    }
    return items;
  }

  async function listTeamWorkspaces(): Promise<ConnectorWorkspace[]> {
    const teams = await paginateAll('/teams', teamSchema);
    return teams.map((team) => ({
      id: team.id,
      name: team.displayName?.trim() || 'Microsoft Teams team',
    }));
  }

  async function verify(): Promise<ConnectorIdentity> {
    // Minting a token validates the credentials; listing teams additionally
    // surfaces a missing Team.ReadBasic.All permission at connect time.
    await getToken();
    return {
      source: SOURCE,
      accountName: 'Microsoft Teams',
      workspaces: await listTeamWorkspaces(),
    };
  }

  async function listWorkspaces(): Promise<ConnectorWorkspace[]> {
    return listTeamWorkspaces();
  }

  /** A team's channels, each surfaced as a connectable "project". */
  async function listProjects(workspaceId: string): Promise<TeamsChannel[]> {
    const teamId = workspaceId?.trim();
    if (!teamId) {
      throw new ConnectorError(SOURCE, 'config', 'A Microsoft Teams team is required.');
    }
    const channels = await paginateAll(
      `/teams/${encodeURIComponent(teamId)}/channels`,
      channelSchema,
    );
    return channels.map((channel) => ({
      id: `${teamId}${TARGET_SEPARATOR}${channel.id}`,
      name: channel.displayName?.trim() || 'Teams channel',
    }));
  }

  /** Resolves a channel's display name, falls back rather than failing a pull. */
  async function channelLabel(teamId: string, channelId: string): Promise<string> {
    try {
      const channel = await request(
        `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`,
        channelSchema,
      );
      return channel.displayName?.trim() || 'Teams channel';
    } catch {
      return 'Teams channel';
    }
  }

  /** Pulls events for one Teams channel. */
  async function fetchChannelActivity(
    teamId: string,
    channelId: string,
    window: ConnectorWindow,
  ): Promise<{ events: SourceEvent[]; warnings: string[]; itemsScanned: number }> {
    const messages: TeamsMessage[] = [];
    const warnings: string[] = [];
    let url: string | undefined =
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages` +
      `?$top=${PAGE_LIMIT}`;
    let pages = 0;
    while (url) {
      if (pages >= MAX_PAGES) {
        warnings.push('Only the most recent Teams messages were scanned, the channel is very active.');
        break;
      }
      const page = await fetchCollection(url);
      pages += 1;
      const batch = parseItems(page.value, messageSchema);
      messages.push(...batch);
      // Graph returns messages newest-first; once a whole page predates the
      // window there is nothing older worth fetching.
      const oldest = batch[batch.length - 1]?.createdDateTime;
      if (oldest && Date.parse(oldest) < window.since.getTime()) break;
      url = page.nextLink;
    }

    const channelName = await channelLabel(teamId, channelId);

    const events: SourceEvent[] = [];
    for (const message of messages) {
      if (message.messageType && message.messageType !== 'message') continue;
      if (message.deletedDateTime) continue;
      const createdAt = message.createdDateTime;
      if (!createdAt || !inWindow(createdAt, window)) continue;

      const detail = messageText(message.body);
      if (!detail) continue;

      events.push({
        id: `teams:message:${channelId}:${message.id}`,
        source: SOURCE,
        kind: 'comment',
        title: message.subject?.trim() || channelName,
        detail,
        actor: message.from?.user?.displayName ?? undefined,
        timestamp: createdAt,
        url: message.webUrl,
      });
    }
    return { events, warnings, itemsScanned: messages.length };
  }

  async function fetchActivity(window: ConnectorWindow): Promise<ActivityDigest> {
    const targets = (config.targets ?? [])
      .map((t) => ({ teamId: t.teamId?.trim(), channelId: t.channelId?.trim() }))
      .filter((t): t is TeamsTarget => Boolean(t.teamId && t.channelId));
    if (targets.length === 0) {
      throw new ConnectorError(SOURCE, 'config', 'No Teams channel is selected for this connector.');
    }
    assertWindow(SOURCE, window);

    const events: SourceEvent[] = [];
    const warnings: string[] = [];
    let itemsScanned = 0;
    for (const { teamId, channelId } of targets) {
      const pull = await fetchChannelActivity(teamId, channelId, window);
      events.push(...pull.events);
      warnings.push(...pull.warnings);
      itemsScanned += pull.itemsScanned;
    }
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      source: SOURCE,
      window,
      fetchedAt: new Date().toISOString(),
      events,
      warnings,
      stats: { itemsScanned, eventsFound: events.length },
    };
  }

  return { source: SOURCE, verify, fetchActivity, listWorkspaces, listProjects };
}

// --- Pure helpers ----------------------------------------------------------

/** Pulls plain text out of a Teams message body, then collapses and caps it. */
function messageText(body: TeamsMessage['body']): string | undefined {
  const raw = body?.content?.trim();
  if (!raw) return undefined;
  const text =
    body?.contentType?.toLowerCase() === 'html'
      ? htmlToText(raw)
      : raw.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length <= MESSAGE_DETAIL_LIMIT) return text;
  return `${text.slice(0, MESSAGE_DETAIL_LIMIT).trimEnd()}…`;
}

/** A minimal HTML-to-text pass. Teams `html` bodies are light markup. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

