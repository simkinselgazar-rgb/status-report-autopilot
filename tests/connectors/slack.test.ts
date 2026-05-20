import { describe, expect, it } from 'vitest';

import { createSlackConnector } from '@/lib/connectors/slack';
import { ConnectorError } from '@/lib/connectors/types';

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

/** A fetch that hands back queued responses in order, ignoring the request. */
function queuedFetch(...responses: Response[]): typeof fetch {
  let i = 0;
  return (async () => {
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return next;
  }) as unknown as typeof fetch;
}

function message(overrides: Record<string, unknown> = {}) {
  return { type: 'message', ts: '1747008000.000100', user: 'U1', text: 'Shipped the homepage', ...overrides };
}

describe('SlackConnector.verify', () => {
  it('returns the connected team as a workspace', async () => {
    const connector = createSlackConnector({
      accessToken: 'xoxb-x',
      fetch: queuedFetch(json({ ok: true, team: 'Acme', team_id: 'T1', user: 'dana' })),
    });
    const identity = await connector.verify();
    expect(identity.source).toBe('slack');
    expect(identity.workspaces).toEqual([{ id: 'T1', name: 'Acme' }]);
  });

  it('throws an auth error when Slack rejects the token', async () => {
    const connector = createSlackConnector({
      accessToken: 'xoxb-x',
      fetch: queuedFetch(json({ ok: false, error: 'invalid_auth' })),
    });
    await expect(connector.verify()).rejects.toMatchObject({ code: 'auth' });
  });
});

describe('createSlackConnector config', () => {
  it('throws when no token is given', () => {
    expect(() => createSlackConnector({ accessToken: '  ' })).toThrow(ConnectorError);
  });
});

describe('SlackConnector.listProjects', () => {
  it('returns the public channels', async () => {
    const connector = createSlackConnector({
      accessToken: 'xoxb-x',
      fetch: queuedFetch(json({ ok: true, channels: [{ id: 'C1', name: 'client-acme' }] })),
    });
    expect(await connector.listProjects('T1')).toEqual([{ id: 'C1', name: 'client-acme' }]);
  });

  it('follows channel pagination', async () => {
    const connector = createSlackConnector({
      accessToken: 'xoxb-x',
      fetch: queuedFetch(
        json({
          ok: true,
          channels: [{ id: 'C1', name: 'one' }],
          response_metadata: { next_cursor: 'cur-1' },
        }),
        json({ ok: true, channels: [{ id: 'C2', name: 'two' }] }),
      ),
    });
    expect(await connector.listProjects('T1')).toHaveLength(2);
  });

  it('retries a 429 and then succeeds', async () => {
    const connector = createSlackConnector({
      accessToken: 'xoxb-x',
      fetch: queuedFetch(
        json({}, { status: 429, headers: { 'Retry-After': '0' } }),
        json({ ok: true, channels: [{ id: 'C1', name: 'one' }] }),
      ),
    });
    expect(await connector.listProjects('T1')).toHaveLength(1);
  });
});

describe('SlackConnector.fetchActivity', () => {
  it('throws config when no channel is selected', async () => {
    const connector = createSlackConnector({ accessToken: 'xoxb-x', fetch: queuedFetch(json({})) });
    await expect(connector.fetchActivity(WINDOW)).rejects.toMatchObject({ code: 'config' });
  });

  it('throws config when the window is inverted', async () => {
    const connector = createSlackConnector({
      accessToken: 'xoxb-x',
      channelIds: ['C1'],
      fetch: queuedFetch(json({ ok: true, messages: [] })),
    });
    await expect(
      connector.fetchActivity({ since: WINDOW.until, until: WINDOW.since }),
    ).rejects.toMatchObject({ code: 'config' });
  });

  it('normalizes real messages into comment events with resolved actors', async () => {
    const connector = createSlackConnector({
      accessToken: 'xoxb-x',
      channelIds: ['C1'],
      fetch: queuedFetch(
        json({
          ok: true,
          messages: [
            message({ user: 'U1', text: 'Shipped the homepage' }),
            message({ subtype: 'channel_join', user: 'U2', text: 'joined' }),
            message({ user: 'U1', text: '   ' }),
            message({ bot_id: 'B1', user: undefined, text: 'deploy finished' }),
          ],
        }),
        json({ ok: true, members: [{ id: 'U1', real_name: 'Dana Holt' }] }),
        json({ ok: true, channel: { id: 'C1', name: 'client-acme' } }),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.events).toHaveLength(1);
    expect(digest.events[0]).toMatchObject({
      kind: 'comment',
      title: '#client-acme',
      detail: 'Shipped the homepage',
      actor: 'Dana Holt',
    });
  });
});
