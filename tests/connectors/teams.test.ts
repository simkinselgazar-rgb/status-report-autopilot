import { describe, expect, it } from 'vitest';

import { ConnectorError } from '@/lib/connectors/types';
import { createTeamsConnector, splitTeamsTarget } from '@/lib/connectors/teams';

const CREDS = { tenantId: 'tid', clientId: 'cid', clientSecret: 'sec' };

const WINDOW = {
  since: new Date('2026-05-11T00:00:00.000Z'),
  until: new Date('2026-05-15T23:59:59.999Z'),
};

function json(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
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
  return json({ access_token: 'graph.token', expires_in: 3600 });
}

describe('splitTeamsTarget', () => {
  it('splits a teamId|channelId composite', () => {
    expect(splitTeamsTarget('t1|19:abc@thread.tacv2')).toEqual({
      teamId: 't1',
      channelId: '19:abc@thread.tacv2',
    });
  });

  it('treats a composite with no separator as a bare channel id', () => {
    expect(splitTeamsTarget('19:abc')).toEqual({ teamId: '', channelId: '19:abc' });
  });
});

describe('createTeamsConnector config', () => {
  it('throws when credentials are missing', () => {
    expect(() => createTeamsConnector({ tenantId: '', clientId: '', clientSecret: '' })).toThrow(
      ConnectorError,
    );
  });
});

describe('TeamsConnector.verify', () => {
  it("returns the tenant's teams as workspaces", async () => {
    const connector = createTeamsConnector({
      ...CREDS,
      fetch: queuedFetch(mintOk(), json({ value: [{ id: 't1', displayName: 'Northwind' }] })),
    });
    const identity = await connector.verify();
    expect(identity.source).toBe('teams');
    expect(identity.accountName).toBe('Microsoft Teams');
    expect(identity.workspaces).toEqual([{ id: 't1', name: 'Northwind' }]);
  });

  it('throws an auth error when Microsoft rejects the credentials', async () => {
    const connector = createTeamsConnector({
      ...CREDS,
      fetch: queuedFetch(json({ error: 'invalid_client' }, { status: 401 })),
    });
    await expect(connector.verify()).rejects.toMatchObject({ code: 'auth' });
  });
});

describe('TeamsConnector.listProjects', () => {
  it("lists a team's channels as composite-id projects", async () => {
    const connector = createTeamsConnector({
      ...CREDS,
      fetch: queuedFetch(
        mintOk(),
        json({ value: [{ id: '19:abc@thread.tacv2', displayName: 'General' }] }),
      ),
    });
    expect(await connector.listProjects('t1')).toEqual([
      { id: 't1|19:abc@thread.tacv2', name: 'General' },
    ]);
  });
});

describe('TeamsConnector.fetchActivity', () => {
  it('throws config when no channel is selected', async () => {
    const connector = createTeamsConnector({ ...CREDS, fetch: queuedFetch(mintOk()) });
    await expect(connector.fetchActivity(WINDOW)).rejects.toMatchObject({ code: 'config' });
  });

  it('throws config when the window is inverted', async () => {
    const connector = createTeamsConnector({
      ...CREDS,
      targets: [{ teamId: 't1', channelId: 'c1' }],
      fetch: queuedFetch(mintOk()),
    });
    await expect(
      connector.fetchActivity({ since: WINDOW.until, until: WINDOW.since }),
    ).rejects.toMatchObject({ code: 'config' });
  });

  it('normalizes a message, strips HTML, and skips out-of-window + system messages', async () => {
    const connector = createTeamsConnector({
      ...CREDS,
      targets: [{ teamId: 't1', channelId: 'c1' }],
      fetch: queuedFetch(
        mintOk(),
        json({
          value: [
            {
              id: 'm1',
              messageType: 'message',
              createdDateTime: '2026-05-13T15:00:00Z',
              subject: null,
              webUrl: 'https://teams.microsoft.com/l/message/m1',
              body: { contentType: 'html', content: '<p>The redesign <b>shipped</b> Friday.</p>' },
              from: { user: { displayName: 'Maya Chen' } },
            },
            {
              id: 'm2',
              messageType: 'systemEventMessage',
              createdDateTime: '2026-05-13T16:00:00Z',
              body: { contentType: 'text', content: 'Dana added Maya to the team.' },
              from: null,
            },
            {
              id: 'm3',
              messageType: 'message',
              createdDateTime: '2026-04-01T10:00:00Z',
              body: { contentType: 'text', content: 'Old message.' },
              from: { user: { displayName: 'Dana Holt' } },
            },
          ],
        }),
        json({ id: 'c1', displayName: 'general' }),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.events).toHaveLength(1);
    expect(digest.events[0]).toMatchObject({
      kind: 'comment',
      title: 'general',
      actor: 'Maya Chen',
    });
    expect(digest.events[0]?.detail).toBe('The redesign shipped Friday.');
    expect(digest.events[0]?.detail).not.toContain('<');
    expect(digest.warnings).toEqual([]);
  });

  it('skips a deleted message', async () => {
    const connector = createTeamsConnector({
      ...CREDS,
      targets: [{ teamId: 't1', channelId: 'c1' }],
      fetch: queuedFetch(
        mintOk(),
        json({
          value: [
            {
              id: 'm1',
              messageType: 'message',
              createdDateTime: '2026-05-12T10:00:00Z',
              deletedDateTime: '2026-05-12T11:00:00Z',
              body: { contentType: 'text', content: 'This was removed.' },
              from: { user: { displayName: 'Maya Chen' } },
            },
          ],
        }),
        json({ id: 'c1', displayName: 'general' }),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.events).toHaveLength(0);
  });

  it('follows message pagination across pages', async () => {
    const connector = createTeamsConnector({
      ...CREDS,
      targets: [{ teamId: 't1', channelId: 'c1' }],
      fetch: queuedFetch(
        mintOk(),
        json({
          value: [
            {
              id: 'm1',
              messageType: 'message',
              createdDateTime: '2026-05-13T10:00:00Z',
              body: { contentType: 'text', content: 'Page one update.' },
              from: { user: { displayName: 'Maya Chen' } },
            },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next-page',
        }),
        json({
          value: [
            {
              id: 'm2',
              messageType: 'message',
              createdDateTime: '2026-05-12T10:00:00Z',
              body: { contentType: 'text', content: 'Page two update.' },
              from: { user: { displayName: 'Dana Holt' } },
            },
          ],
        }),
        json({ id: 'c1', displayName: 'general' }),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.events).toHaveLength(2);
    expect(digest.stats.itemsScanned).toBe(2);
  });
});
