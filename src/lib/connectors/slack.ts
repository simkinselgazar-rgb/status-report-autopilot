/**
 * Slack connector, the third source integration.
 *
 * Reads messages from one or more Slack channels and normalizes them into
 * {@link SourceEvent}s (all `comment` kind. Slack carries chatter and flagged
 * blockers, not task state). Token-agnostic: a bot or user OAuth token.
 *
 * Slack's Web API is RPC over HTTP: every call returns `200` with an
 * `{ ok: boolean, error?: string }` envelope, and a channel is the connector's
 * "project". Channels map to the workspace/project shape so the connector
 * reuses the shared connect flow.
 */

import { z } from 'zod';

import { assertWindow, fetchWithRetry } from './http-core';
import {
  ConnectorError,
  type ActivityDigest,
  type Connector,
  type ConnectorIdentity,
  type ConnectorWindow,
  type ConnectorWorkspace,
  type SourceEvent,
} from './types';

const SOURCE = 'slack' as const;
const API_BASE = 'https://slack.com/api';
const PAGE_LIMIT = 200;

export interface SlackConnectorConfig {
  /** A Slack OAuth access token (bot or user). */
  accessToken: string;
  /** The Slack channels this connector tracks. Required by `fetchActivity`. */
  channelIds?: readonly string[];
  /** Injectable fetch, defaults to the global. Override in tests. */
  fetch?: typeof fetch;
}

export interface SlackChannel {
  id: string;
  name: string;
}

export interface SlackConnector extends Connector {
  /** The connected Slack team, as a workspace. */
  listWorkspaces(): Promise<ConnectorWorkspace[]>;
  /** Public channels in the team, surfaced as "projects" for onboarding. */
  listProjects(workspaceId: string): Promise<SlackChannel[]>;
}

// --- Slack API schemas (boundary validation) -------------------------------

const cursorSchema = z.object({ next_cursor: z.string().optional() }).optional();

const authTestSchema = z.object({
  team: z.string().optional(),
  team_id: z.string(),
  user: z.string().optional(),
});

const channelSchema = z.object({ id: z.string(), name: z.string() });

const messageSchema = z.object({
  type: z.string().optional(),
  subtype: z.string().optional(),
  ts: z.string(),
  user: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  bot_id: z.string().optional(),
});

const memberSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  real_name: z.string().optional(),
  profile: z.object({ real_name: z.string().optional() }).optional(),
});

type SlackMessage = z.infer<typeof messageSchema>;
type SlackMember = z.infer<typeof memberSchema>;

/** Message subtypes that are channel noise, not real updates. */
const SKIP_SUBTYPES = new Set([
  'channel_join',
  'channel_leave',
  'channel_topic',
  'channel_purpose',
  'channel_name',
  'channel_archive',
  'bot_message',
  'reminder_add',
]);

// --- Connector -------------------------------------------------------------

export function createSlackConnector(config: SlackConnectorConfig): SlackConnector {
  const doFetch = config.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new ConnectorError(SOURCE, 'config', 'No fetch implementation is available.');
  }
  const token = config.accessToken?.trim();
  if (!token) {
    throw new ConnectorError(SOURCE, 'config', 'A Slack access token is required.');
  }

  async function rawRequest(
    method: string,
    query: Record<string, string | number | undefined>,
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${API_BASE}/${method}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const res = await fetchWithRetry(SOURCE, 'Slack', () =>
      doFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }),
    );

    if (res.status === 429) {
      throw new ConnectorError(SOURCE, 'rate_limited', 'Slack rate limit exceeded.', { status: 429 });
    }
    if (!res.ok) {
      throw new ConnectorError(SOURCE, 'unknown', `Slack request failed (${res.status}).`, {
        status: res.status,
      });
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (cause) {
      throw new ConnectorError(SOURCE, 'bad_response', 'Slack returned an unreadable response.', {
        cause,
      });
    }
    if (typeof json !== 'object' || json === null) {
      throw new ConnectorError(SOURCE, 'bad_response', 'Slack returned an unexpected response.');
    }
    const body = json as Record<string, unknown>;
    if (body.ok !== true) {
      throw classifyError(typeof body.error === 'string' ? body.error : 'unknown');
    }
    return body;
  }

  /** Runs a cursor-paginated method, collecting one field across all pages. */
  async function paginate<T extends z.ZodTypeAny>(
    method: string,
    query: Record<string, string | number | undefined>,
    field: string,
    itemSchema: T,
  ): Promise<z.infer<T>[]> {
    const items: z.infer<T>[] = [];
    let cursor: string | undefined;
    do {
      const body = await rawRequest(method, { ...query, limit: PAGE_LIMIT, cursor });
      const parsed = z.array(itemSchema).safeParse(body[field]);
      if (!parsed.success) {
        throw new ConnectorError(SOURCE, 'bad_response', 'Slack response did not match the expected shape.', {
          cause: parsed.error,
        });
      }
      items.push(...parsed.data);
      cursor = cursorSchema.parse(body.response_metadata)?.next_cursor || undefined;
    } while (cursor);
    return items;
  }

  async function verify(): Promise<ConnectorIdentity> {
    const body = await rawRequest('auth.test', {});
    const parsed = authTestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ConnectorError(SOURCE, 'bad_response', 'Slack identity response was unreadable.', {
        cause: parsed.error,
      });
    }
    return {
      source: SOURCE,
      accountName: parsed.data.user ?? parsed.data.team ?? 'Slack account',
      workspaces: [{ id: parsed.data.team_id, name: parsed.data.team ?? 'Slack workspace' }],
    };
  }

  async function listWorkspaces(): Promise<ConnectorWorkspace[]> {
    return (await verify()).workspaces;
  }

  async function listProjects(): Promise<SlackChannel[]> {
    const channels = await paginate(
      'conversations.list',
      { types: 'public_channel', exclude_archived: 'true' },
      'channels',
      channelSchema,
    );
    return channels.map((c) => ({ id: c.id, name: c.name }));
  }

  /** Pulls events for one Slack channel. */
  async function fetchChannelActivity(
    channelId: string,
    window: ConnectorWindow,
  ): Promise<{ events: SourceEvent[]; itemsScanned: number }> {
    const messages = await paginate(
      'conversations.history',
      {
        channel: channelId,
        oldest: toSlackTs(window.since),
        latest: toSlackTs(window.until),
        inclusive: 'true',
      },
      'messages',
      messageSchema,
    );

    const names = await resolveMemberNames(messages);
    const channelName = await channelLabel(channelId);

    const events: SourceEvent[] = [];
    for (const message of messages) {
      const text = message.text?.trim();
      if (!text) continue;
      if (message.bot_id || (message.subtype && SKIP_SUBTYPES.has(message.subtype))) continue;
      const timestamp = fromSlackTs(message.ts);
      if (!timestamp) continue;
      events.push({
        id: `slack:message:${channelId}:${message.ts}`,
        source: SOURCE,
        kind: 'comment',
        title: channelName,
        detail: text,
        actor: message.user ? names.get(message.user) : undefined,
        timestamp,
      });
    }
    return { events, itemsScanned: messages.length };
  }

  async function fetchActivity(window: ConnectorWindow): Promise<ActivityDigest> {
    const channelIds = (config.channelIds ?? [])
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id));
    if (channelIds.length === 0) {
      throw new ConnectorError(SOURCE, 'config', 'No Slack channel is selected for this connector.');
    }
    assertWindow(SOURCE, window);

    const events: SourceEvent[] = [];
    let itemsScanned = 0;
    for (const channelId of channelIds) {
      const pull = await fetchChannelActivity(channelId, window);
      events.push(...pull.events);
      itemsScanned += pull.itemsScanned;
    }
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      source: SOURCE,
      window,
      fetchedAt: new Date().toISOString(),
      events,
      warnings: [],
      stats: { itemsScanned, eventsFound: events.length },
    };
  }

  /** Resolves the display names of the users who posted in the window. */
  async function resolveMemberNames(messages: SlackMessage[]): Promise<Map<string, string>> {
    const ids = new Set(messages.map((m) => m.user).filter((u): u is string => Boolean(u)));
    if (ids.size === 0) return new Map();
    const members = await paginate('users.list', {}, 'members', memberSchema);
    const names = new Map<string, string>();
    for (const member of members) {
      if (!ids.has(member.id)) continue;
      const name = member.profile?.real_name ?? member.real_name ?? member.name;
      if (name) names.set(member.id, name);
    }
    return names;
  }

  async function channelLabel(channelId: string): Promise<string> {
    try {
      const body = await rawRequest('conversations.info', { channel: channelId });
      const parsed = channelSchema.safeParse(body.channel);
      return parsed.success ? `#${parsed.data.name}` : 'Slack channel';
    } catch {
      return 'Slack channel';
    }
  }

  return { source: SOURCE, verify, fetchActivity, listWorkspaces, listProjects };
}

// --- Pure helpers ----------------------------------------------------------

/** Slack timestamps are Unix seconds with a fractional part (`"1700000000.000200"`). */
function toSlackTs(date: Date): string {
  return (date.getTime() / 1000).toFixed(6);
}

function fromSlackTs(ts: string): string | null {
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function classifyError(error: string): ConnectorError {
  if (['invalid_auth', 'not_authed', 'token_revoked', 'account_inactive'].includes(error)) {
    return new ConnectorError(SOURCE, 'auth', 'Slack rejected the access token.');
  }
  if (error === 'ratelimited' || error === 'rate_limited') {
    return new ConnectorError(SOURCE, 'rate_limited', 'Slack rate limit exceeded.');
  }
  if (['channel_not_found', 'not_in_channel'].includes(error)) {
    return new ConnectorError(SOURCE, 'not_found', 'That Slack channel was not found.');
  }
  return new ConnectorError(SOURCE, 'bad_response', `Slack returned an error: ${error}.`);
}

