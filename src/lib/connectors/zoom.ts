/**
 * Zoom connector, the fifth (and last v1) source integration.
 *
 * Reads a Zoom user's cloud recordings for the window and normalizes each
 * recorded meeting into a `meeting`-kind {@link SourceEvent}. When a recording
 * has a transcript file, a plain-text excerpt of what was said rides along as
 * the event `detail`, the transcript is what makes Zoom worth a connector.
 *
 * Zoom has no workspace layer, an account holds users directly, so
 * `verify()` returns a single synthetic workspace (the account). With
 * Server-to-Server credentials the connector sees the whole account, so
 * `listProjects()` lists the account's users, each user's cloud recordings
 * is a connectable "project".
 */

import { z } from 'zod';

import { assertWindow, fetchWithRetry, inWindow } from './http-core';
import {
  ConnectorError,
  type ActivityDigest,
  type Connector,
  type ConnectorIdentity,
  type ConnectorWindow,
  type ConnectorWorkspace,
  type SourceEvent,
} from './types';
import { mintAccessToken } from './zoom-oauth';

const SOURCE = 'zoom' as const;
const API_BASE = 'https://api.zoom.us/v2';
const PAGE_LIMIT = 300;
/** The single synthetic workspace. Zoom accounts have no workspace layer. */
const ACCOUNT_WORKSPACE = 'account';
/** Transcript excerpt cap, keeps a digest of many meetings prompt-sized. */
const TRANSCRIPT_EXCERPT_LIMIT = 1500;

export interface ZoomConnectorConfig {
  /** Zoom Server-to-Server OAuth credentials, the connector mints tokens from these. */
  accountId: string;
  clientId: string;
  clientSecret: string;
  /** The Zoom user whose cloud recordings this connector reads. Required by `fetchActivity`. */
  userId?: string;
  /** Injectable fetch, defaults to the global. Override in tests. */
  fetch?: typeof fetch;
}

/** A connectable recording set, surfaced as the connector's "project". */
export interface ZoomRecordingSet {
  id: string;
  name: string;
}

export interface ZoomConnector extends Connector {
  /** The connected Zoom account, as a single workspace. */
  listWorkspaces(): Promise<ConnectorWorkspace[]>;
  /** The authenticated user's recordings, the one "project" for onboarding. */
  listProjects(workspaceId: string): Promise<ZoomRecordingSet[]>;
}

// --- Zoom API schemas (boundary validation) --------------------------------

const userSchema = z.object({
  id: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  display_name: z.string().optional(),
  email: z.string().optional(),
});

const recordingFileSchema = z.object({
  id: z.string().optional(),
  file_type: z.string().optional(),
  file_extension: z.string().optional(),
  download_url: z.string().optional(),
});

const recordingMeetingSchema = z.object({
  uuid: z.string(),
  topic: z.string().optional(),
  start_time: z.string().optional(),
  duration: z.number().optional(),
  host_email: z.string().optional(),
  share_url: z.string().optional(),
  recording_files: z.array(recordingFileSchema).optional(),
});

const recordingsListSchema = z.object({
  meetings: z.array(recordingMeetingSchema).optional(),
  next_page_token: z.string().optional(),
});

const usersListSchema = z.object({
  users: z.array(userSchema).optional(),
  next_page_token: z.string().optional(),
});

type ZoomUser = z.infer<typeof userSchema>;

// --- Connector -------------------------------------------------------------

export function createZoomConnector(config: ZoomConnectorConfig): ZoomConnector {
  const doFetch = config.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new ConnectorError(SOURCE, 'config', 'No fetch implementation is available.');
  }
  const accountId = config.accountId?.trim();
  const clientId = config.clientId?.trim();
  const clientSecret = config.clientSecret?.trim();
  if (!accountId || !clientId || !clientSecret) {
    throw new ConnectorError(SOURCE, 'config', 'Zoom Server-to-Server credentials are required.');
  }

  // The access token is minted lazily from the S2S credentials and cached for
  // this connector instance, one operation, well inside the token's lifetime.
  let cachedToken: string | undefined;
  async function getToken(): Promise<string> {
    if (cachedToken) return cachedToken;
    try {
      cachedToken = await mintAccessToken({ accountId, clientId, clientSecret }, { fetch: doFetch });
    } catch (cause) {
      throw new ConnectorError(SOURCE, 'auth', 'Zoom rejected the Server-to-Server credentials.', {
        cause,
      });
    }
    return cachedToken;
  }

  async function rawRequest(
    path: string,
    query: Record<string, string | number | boolean | undefined>,
  ): Promise<unknown> {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const token = await getToken();
    const res = await fetchWithRetry(SOURCE, 'Zoom', () =>
      doFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }),
    );

    if (res.ok) {
      try {
        return await res.json();
      } catch (cause) {
        throw new ConnectorError(SOURCE, 'bad_response', 'Zoom returned an unreadable response.', {
          cause,
        });
      }
    }
    if (res.status === 401) {
      throw new ConnectorError(SOURCE, 'auth', 'Zoom rejected the access token.', { status: 401 });
    }
    if (res.status === 404) {
      throw new ConnectorError(SOURCE, 'not_found', 'The Zoom resource was not found.', {
        status: 404,
      });
    }
    if (res.status === 429) {
      throw new ConnectorError(SOURCE, 'rate_limited', 'Zoom rate limit exceeded.', { status: 429 });
    }
    throw new ConnectorError(SOURCE, 'unknown', `Zoom request failed (${res.status}).`, {
      status: res.status,
    });
  }

  async function request<T extends z.ZodTypeAny>(
    path: string,
    query: Record<string, string | number | boolean | undefined>,
    schema: T,
  ): Promise<z.infer<T>> {
    const json = await rawRequest(path, query);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ConnectorError(SOURCE, 'bad_response', 'Zoom response did not match the expected shape.', {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  /** Downloads a recording file (transcript VTT) as text. */
  async function downloadText(downloadUrl: string): Promise<string> {
    const token = await getToken();
    const res = await doFetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new ConnectorError(SOURCE, 'bad_response', `Transcript download failed (${res.status}).`, {
        status: res.status,
      });
    }
    return res.text();
  }

  async function verify(): Promise<ConnectorIdentity> {
    // Minting a token from the credentials is the verification. Zoom's token
    // endpoint rejects a bad account id, client id, or client secret.
    await getToken();
    return {
      source: SOURCE,
      accountName: 'Zoom account',
      workspaces: [{ id: ACCOUNT_WORKSPACE, name: 'Zoom account' }],
    };
  }

  async function listWorkspaces(): Promise<ConnectorWorkspace[]> {
    return (await verify()).workspaces;
  }

  /** The account's users, each user's cloud recordings is a connectable "project". */
  async function listProjects(): Promise<ZoomRecordingSet[]> {
    const page = await request(
      '/users',
      { status: 'active', page_size: PAGE_LIMIT },
      usersListSchema,
    );
    return (page.users ?? []).map((user) => ({ id: user.id, name: displayName(user) }));
  }

  async function fetchActivity(window: ConnectorWindow): Promise<ActivityDigest> {
    const userId = config.userId?.trim();
    if (!userId) {
      throw new ConnectorError(SOURCE, 'config', 'No Zoom user is selected for this connector.');
    }
    assertWindow(SOURCE, window);

    const meetings: z.infer<typeof recordingMeetingSchema>[] = [];
    let pageToken: string | undefined;
    do {
      const page = await request(
        `/users/${encodeURIComponent(userId)}/recordings`,
        {
          from: toDateParam(window.since),
          to: toDateParam(window.until),
          page_size: PAGE_LIMIT,
          next_page_token: pageToken,
        },
        recordingsListSchema,
      );
      meetings.push(...(page.meetings ?? []));
      pageToken = page.next_page_token || undefined;
    } while (pageToken);

    const warnings: string[] = [];
    const events: SourceEvent[] = [];
    for (const meeting of meetings) {
      const startsAt = meeting.start_time;
      if (!startsAt || !inWindow(startsAt, window)) continue;

      const transcript = meeting.recording_files?.find(
        (file) => file.file_type?.toUpperCase() === 'TRANSCRIPT' && file.download_url,
      );

      let detail: string | undefined;
      if (transcript?.download_url) {
        try {
          detail = transcriptExcerpt(await downloadText(transcript.download_url));
        } catch {
          warnings.push(`Couldn’t read the transcript for “${meeting.topic ?? 'a meeting'}”.`);
        }
      }
      if (!detail) {
        detail = meeting.duration
          ? `${meeting.duration}-minute recorded meeting, no transcript available`
          : undefined;
      }

      events.push({
        id: `zoom:meeting:${meeting.uuid}`,
        source: SOURCE,
        kind: 'meeting',
        title: meeting.topic?.trim() || 'Zoom meeting',
        ...(detail ? { detail } : {}),
        actor: meeting.host_email,
        timestamp: startsAt,
        url: meeting.share_url,
      });
    }
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      source: SOURCE,
      window,
      fetchedAt: new Date().toISOString(),
      events,
      warnings,
      stats: { itemsScanned: meetings.length, eventsFound: events.length },
    };
  }

  return { source: SOURCE, verify, fetchActivity, listWorkspaces, listProjects };
}

// --- Pure helpers ----------------------------------------------------------

function displayName(user: ZoomUser): string {
  const full = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
  return user.display_name?.trim() || full || user.email || 'Zoom account';
}

/** Zoom's recordings query takes calendar dates (`YYYY-MM-DD`). */
function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Pulls the spoken text out of a Zoom transcript VTT, drops the `WEBVTT`
 * header, cue indices, and `-->` timing lines, then collapses and caps it.
 */
function transcriptExcerpt(vtt: string): string {
  const text: string[] = [];
  for (const line of vtt.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === 'WEBVTT' || trimmed.startsWith('NOTE')) continue;
    if (trimmed.includes('-->')) continue;
    if (/^\d+$/.test(trimmed)) continue;
    text.push(trimmed);
  }
  const joined = text.join(' ').replace(/\s+/g, ' ').trim();
  if (joined.length <= TRANSCRIPT_EXCERPT_LIMIT) return joined;
  return `${joined.slice(0, TRANSCRIPT_EXCERPT_LIMIT).trimEnd()}…`;
}

