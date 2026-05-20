import { describe, expect, it } from 'vitest';

import { createLinearConnector } from '@/lib/connectors/linear';
import { ConnectorError } from '@/lib/connectors/types';

// --- fixtures --------------------------------------------------------------

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

function viewerBody() {
  return {
    data: {
      viewer: { name: 'Dana Holt', email: 'dana@studio.com' },
      teams: { nodes: [{ id: 'team-1', name: 'Product' }] },
    },
  };
}

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    identifier: 'PRD-1',
    title: 'Ship the billing rework',
    url: 'https://linear.app/x/issue/PRD-1',
    createdAt: '2026-05-12T10:00:00.000Z',
    completedAt: null,
    assignee: { name: 'Dana Holt' },
    comments: { nodes: [] },
    ...overrides,
  };
}

function activityBody(
  nodes: unknown[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = { hasNextPage: false, endCursor: null },
) {
  return { data: { project: { issues: { nodes, pageInfo } } } };
}

// --- verify ----------------------------------------------------------------

describe('LinearConnector.verify', () => {
  it('returns the connected identity and teams', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      fetch: queuedFetch(json(viewerBody())),
    });
    const identity = await connector.verify();
    expect(identity.source).toBe('linear');
    expect(identity.accountName).toBe('Dana Holt');
    expect(identity.workspaces).toEqual([{ id: 'team-1', name: 'Product' }]);
  });

  it('throws an auth error on a 401', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      fetch: queuedFetch(json({}, { status: 401 })),
    });
    await expect(connector.verify()).rejects.toMatchObject({ code: 'auth' });
  });

  it('throws an auth error when the GraphQL body carries an authentication error', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      fetch: queuedFetch(
        json({ errors: [{ message: 'Authentication required', extensions: { type: 'authentication error' } }] }),
      ),
    });
    await expect(connector.verify()).rejects.toMatchObject({ code: 'auth' });
  });

  it('throws bad_response for a generic GraphQL error', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      fetch: queuedFetch(json({ errors: [{ message: 'Field "nope" does not exist' }] })),
    });
    await expect(connector.verify()).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('throws bad_response when the shape does not match', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      fetch: queuedFetch(json({ data: { viewer: { name: 42 } } })),
    });
    await expect(connector.verify()).rejects.toMatchObject({ code: 'bad_response' });
  });
});

// --- config ----------------------------------------------------------------

describe('createLinearConnector config', () => {
  it('throws when no token is given', () => {
    expect(() => createLinearConnector({ accessToken: '  ' })).toThrow(ConnectorError);
  });
});

// --- fetchActivity ---------------------------------------------------------

describe('LinearConnector.fetchActivity', () => {
  it('throws config when no project is selected', async () => {
    const connector = createLinearConnector({ accessToken: 'lin_api_x', fetch: queuedFetch(json({})) });
    await expect(connector.fetchActivity(WINDOW)).rejects.toMatchObject({ code: 'config' });
  });

  it('throws config when the window is inverted', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      projectId: 'p1',
      fetch: queuedFetch(json(activityBody([]))),
    });
    await expect(
      connector.fetchActivity({ since: WINDOW.until, until: WINDOW.since }),
    ).rejects.toMatchObject({ code: 'config' });
  });

  it('throws not_found when the project is missing', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      projectId: 'gone',
      fetch: queuedFetch(json({ data: { project: null } })),
    });
    await expect(connector.fetchActivity(WINDOW)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('normalizes created + completed issues and comments inside the window', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      projectId: 'p1',
      fetch: queuedFetch(
        json(
          activityBody([
            issue({
              id: 'i1',
              createdAt: '2026-05-12T10:00:00.000Z',
              completedAt: '2026-05-14T09:00:00.000Z',
              comments: {
                nodes: [
                  { id: 'c1', body: 'Looks good', createdAt: '2026-05-13T08:00:00.000Z', user: { name: 'Leo Park' } },
                ],
              },
            }),
          ]),
        ),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    const kinds = digest.events.map((e) => e.kind).sort();
    expect(kinds).toEqual(['comment', 'task_completed', 'task_created']);
    expect(digest.stats.itemsScanned).toBe(1);
    expect(digest.events.find((e) => e.kind === 'comment')?.detail).toBe('Looks good');
    expect(digest.events.find((e) => e.kind === 'comment')?.actor).toBe('Leo Park');
  });

  it('excludes events and comments outside the window', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      projectId: 'p1',
      fetch: queuedFetch(
        json(
          activityBody([
            issue({
              createdAt: '2026-04-01T10:00:00.000Z',
              completedAt: null,
              comments: {
                nodes: [
                  { id: 'c-old', body: 'Stale', createdAt: '2026-04-02T08:00:00.000Z', user: { name: 'X' } },
                  { id: 'c-empty', body: '   ', createdAt: '2026-05-13T08:00:00.000Z', user: { name: 'Y' } },
                ],
              },
            }),
          ]),
        ),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.events).toHaveLength(0);
  });

  it('follows issue pagination across pages', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      projectId: 'p1',
      fetch: queuedFetch(
        json(activityBody([issue({ id: 'i1' })], { hasNextPage: true, endCursor: 'cur-1' })),
        json(activityBody([issue({ id: 'i2', title: 'Second issue' })])),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.stats.itemsScanned).toBe(2);
  });

  it('retries a 429 and then succeeds', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      projectId: 'p1',
      fetch: queuedFetch(
        json({}, { status: 429, headers: { 'Retry-After': '0' } }),
        json(activityBody([issue()])),
      ),
    });
    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.stats.itemsScanned).toBe(1);
  });
});

// --- listProjects ----------------------------------------------------------

describe('LinearConnector.listProjects', () => {
  it('returns a team’s projects', async () => {
    const connector = createLinearConnector({
      accessToken: 'lin_api_x',
      fetch: queuedFetch(
        json({
          data: {
            team: {
              projects: {
                nodes: [{ id: 'p1', name: 'Site redesign' }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        }),
      ),
    });
    const projects = await connector.listProjects('team-1');
    expect(projects).toEqual([{ id: 'p1', name: 'Site redesign' }]);
  });

  it('throws config when no team id is given', async () => {
    const connector = createLinearConnector({ accessToken: 'lin_api_x', fetch: queuedFetch(json({})) });
    await expect(connector.listProjects('')).rejects.toMatchObject({ code: 'config' });
  });
});
