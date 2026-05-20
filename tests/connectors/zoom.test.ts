import { describe, expect, it } from 'vitest';

import { ConnectorError } from '@/lib/connectors/types';
import { createZoomConnector } from '@/lib/connectors/zoom';

const CREDS = { accountId: 'acc', clientId: 'cid', clientSecret: 'sec' };

const WINDOW = {
  since: new Date('2026-05-11T00:00:00.000Z'),
  until: new Date('2026-05-15T23:59:59.999Z'),
};

function json(body: unknown, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
}

function text(body: string, init?: { status?: number }): Response {
  return new Response(body, {
    status: init?.status ?? 200,
    headers: { 'content-type': 'text/vtt' },
  });
}

/** A fetch that hands back queued responses in order, ignoring the request. */
function queuedFetch(...responses: Response[]): typeof fetch {
  let i = 0;
  return (async () => {
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return next;
  }) as unknown as typeof fetch;
}

/** The token-mint response, the connector mints once before its first API call. */
function mintOk(): Response {
  return json({ access_token: 'zm.token', expires_in: 3600 });
}

const TRANSCRIPT_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:04.000
Maya Chen: Welcome everyone to the weekly sync.

2
00:00:04.000 --> 00:00:09.500
Dana Holt: The redesign is on track for Friday.`;

describe('createZoomConnector config', () => {
  it('throws when credentials are missing', () => {
    expect(() => createZoomConnector({ accountId: '', clientId: '', clientSecret: '' })).toThrow(
      ConnectorError,
    );
  });
});

describe('ZoomConnector.verify', () => {
  it('returns the Zoom account as a single workspace', async () => {
    const connector = createZoomConnector({ ...CREDS, fetch: queuedFetch(mintOk()) });
    const identity = await connector.verify();
    expect(identity.source).toBe('zoom');
    expect(identity.workspaces).toEqual([{ id: 'account', name: 'Zoom account' }]);
  });

  it('throws an auth error when Zoom rejects the credentials', async () => {
    const connector = createZoomConnector({
      ...CREDS,
      fetch: queuedFetch(json({ error: 'invalid_client' }, { status: 401 })),
    });
    await expect(connector.verify()).rejects.toMatchObject({ code: 'auth' });
  });
});

describe('ZoomConnector.listProjects', () => {
  it('lists the account users as recording sets', async () => {
    const connector = createZoomConnector({
      ...CREDS,
      fetch: queuedFetch(
        mintOk(),
        json({ users: [{ id: 'u1', first_name: 'Maya', last_name: 'Chen' }] }),
      ),
    });
    expect(await connector.listProjects('account')).toEqual([{ id: 'u1', name: 'Maya Chen' }]);
  });
});

describe('ZoomConnector.fetchActivity', () => {
  it('throws config when no user is selected', async () => {
    const connector = createZoomConnector({ ...CREDS, fetch: queuedFetch(mintOk()) });
    await expect(connector.fetchActivity(WINDOW)).rejects.toMatchObject({ code: 'config' });
  });

  it('throws config when the window is inverted', async () => {
    const connector = createZoomConnector({
      ...CREDS,
      userIds: ['u1'],
      fetch: queuedFetch(mintOk()),
    });
    await expect(
      connector.fetchActivity({ since: WINDOW.until, until: WINDOW.since }),
    ).rejects.toMatchObject({ code: 'config' });
  });

  it('normalizes a recorded meeting, attaches a transcript excerpt, and skips out-of-window', async () => {
    const connector = createZoomConnector({
      ...CREDS,
      userIds: ['u1'],
      fetch: queuedFetch(
        mintOk(),
        json({
          meetings: [
            {
              uuid: 'abc==',
              topic: 'Northwind weekly sync',
              start_time: '2026-05-13T15:00:00Z',
              duration: 47,
              host_email: 'maya@northwind.com',
              recording_files: [
                { file_type: 'MP4', download_url: 'https://zoom.us/rec/mp4' },
                { file_type: 'TRANSCRIPT', download_url: 'https://zoom.us/rec/vtt' },
              ],
            },
            {
              uuid: 'old==',
              topic: 'Old sync',
              start_time: '2026-04-01T15:00:00Z',
              recording_files: [],
            },
          ],
        }),
        text(TRANSCRIPT_VTT),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.events).toHaveLength(1);
    expect(digest.events[0]).toMatchObject({
      kind: 'meeting',
      title: 'Northwind weekly sync',
      actor: 'maya@northwind.com',
    });
    expect(digest.events[0]?.detail).toContain('redesign is on track for Friday');
    expect(digest.events[0]?.detail).not.toContain('-->');
    expect(digest.warnings).toEqual([]);
  });

  it('falls back to meeting metadata when there is no transcript file', async () => {
    const connector = createZoomConnector({
      ...CREDS,
      userIds: ['u1'],
      fetch: queuedFetch(
        mintOk(),
        json({
          meetings: [
            {
              uuid: 'abc==',
              topic: 'Client check-in',
              start_time: '2026-05-12T10:00:00Z',
              duration: 30,
              recording_files: [{ file_type: 'MP4', download_url: 'https://zoom.us/rec/mp4' }],
            },
          ],
        }),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.events[0]?.detail).toBe('30-minute recorded meeting, no transcript available');
    expect(digest.warnings).toEqual([]);
  });

  it('warns and falls back when a transcript download fails', async () => {
    const connector = createZoomConnector({
      ...CREDS,
      userIds: ['u1'],
      fetch: queuedFetch(
        mintOk(),
        json({
          meetings: [
            {
              uuid: 'abc==',
              topic: 'Roadmap review',
              start_time: '2026-05-12T10:00:00Z',
              duration: 25,
              recording_files: [{ file_type: 'TRANSCRIPT', download_url: 'https://zoom.us/rec/vtt' }],
            },
          ],
        }),
        text('upstream error', { status: 500 }),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.events[0]?.detail).toBe('25-minute recorded meeting, no transcript available');
    expect(digest.warnings).toHaveLength(1);
    expect(digest.warnings[0]).toContain('Roadmap review');
  });

  it('follows recording pagination across pages', async () => {
    const connector = createZoomConnector({
      ...CREDS,
      userIds: ['u1'],
      fetch: queuedFetch(
        mintOk(),
        json({
          meetings: [
            { uuid: 'm1', start_time: '2026-05-12T10:00:00Z', duration: 15, recording_files: [] },
          ],
          next_page_token: 'p2',
        }),
        json({
          meetings: [
            { uuid: 'm2', start_time: '2026-05-13T10:00:00Z', duration: 20, recording_files: [] },
          ],
        }),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.events).toHaveLength(2);
    expect(digest.stats.itemsScanned).toBe(2);
  });
});
