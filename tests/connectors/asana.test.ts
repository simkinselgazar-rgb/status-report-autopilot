import { describe, expect, it } from 'vitest';

import { createAsanaConnector } from '@/lib/connectors/asana';
import { ConnectorError, type ConnectorWindow } from '@/lib/connectors/types';
import { POST as verifyRoute } from '@/app/api/connectors/[source]/verify/route';
import { POST as projectsRoute } from '@/app/api/connectors/[source]/projects/route';

/** The dynamic route's params context, fixed to the Asana source. */
const asanaCtx = { params: Promise.resolve({ source: 'asana' }) };

// --- test helpers ----------------------------------------------------------

type Handler = (url: URL) => { status?: number; body: unknown; headers?: Record<string, string> };

/** Build a `fetch` stand-in that routes by pathname. */
function mockFetch(handler: Handler): typeof fetch {
  const impl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = input instanceof URL ? input : new URL(String(input));
    const { status = 200, body, headers } = handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  };
  return impl as unknown as typeof fetch;
}

const WINDOW: ConnectorWindow = {
  since: new Date('2026-05-11T00:00:00.000Z'),
  until: new Date('2026-05-15T23:59:59.999Z'),
};

// --- verify() --------------------------------------------------------------

describe('AsanaConnector.verify', () => {
  it('returns the connected identity and workspaces', async () => {
    const connector = createAsanaConnector({
      accessToken: 'tok',
      fetch: mockFetch(() => ({
        body: {
          data: {
            gid: 'u1',
            name: 'Ahmed Elgazar',
            email: 'ahmed@example.com',
            workspaces: [{ gid: 'w1', name: 'Simkins & Elgazar' }],
          },
        },
      })),
    });

    const identity = await connector.verify();

    expect(identity.source).toBe('asana');
    expect(identity.accountName).toBe('Ahmed Elgazar');
    expect(identity.accountEmail).toBe('ahmed@example.com');
    expect(identity.workspaces).toEqual([{ id: 'w1', name: 'Simkins & Elgazar' }]);
  });

  it('raises an auth error when the token is rejected', async () => {
    const connector = createAsanaConnector({
      accessToken: 'bad',
      fetch: mockFetch(() => ({ status: 401, body: { errors: [{ message: 'Not Authorized' }] } })),
    });

    await expect(connector.verify()).rejects.toMatchObject({
      name: 'ConnectorError',
      code: 'auth',
    });
  });

  it('raises a bad_response error when the payload shape is wrong', async () => {
    const connector = createAsanaConnector({
      accessToken: 'tok',
      // gid must be a string, a number should fail boundary validation.
      fetch: mockFetch(() => ({ body: { data: { gid: 123, name: 'Ahmed' } } })),
    });

    await expect(connector.verify()).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('retries past a 429 and then succeeds', async () => {
    let calls = 0;
    const connector = createAsanaConnector({
      accessToken: 'tok',
      fetch: mockFetch(() => {
        calls += 1;
        if (calls === 1) {
          return { status: 429, body: { errors: [] }, headers: { 'Retry-After': '0' } };
        }
        return { body: { data: { gid: 'u1', name: 'Ahmed', workspaces: [] } } };
      }),
    });

    const identity = await connector.verify();

    expect(calls).toBe(2);
    expect(identity.accountName).toBe('Ahmed');
  });
});

// --- fetchActivity() -------------------------------------------------------

describe('AsanaConnector.fetchActivity', () => {
  it('rejects when no project is configured', async () => {
    const connector = createAsanaConnector({ accessToken: 'tok', fetch: mockFetch(() => ({ body: {} })) });

    await expect(connector.fetchActivity(WINDOW)).rejects.toMatchObject({ code: 'config' });
  });

  it('rejects when the window is inverted', async () => {
    const connector = createAsanaConnector({
      accessToken: 'tok',
      projectGids: ['P'],
      fetch: mockFetch(() => ({ body: { data: [] } })),
    });

    await expect(
      connector.fetchActivity({ since: WINDOW.until, until: WINDOW.since }),
    ).rejects.toMatchObject({ code: 'config' });
  });

  it('normalizes tasks and stories into in-window events, oldest first', async () => {
    const tasks = [
      {
        gid: 'A',
        name: 'Homepage build',
        resource_subtype: 'default_task',
        completed: true,
        completed_at: '2026-05-13T10:00:00.000Z',
        created_at: '2026-05-01T09:00:00.000Z', // before the window
        modified_at: '2026-05-13T10:00:00.000Z',
        permalink_url: 'https://app.asana.com/0/A',
        assignee: { name: 'Dana' },
      },
      {
        gid: 'B',
        name: 'Launch milestone',
        resource_subtype: 'milestone',
        completed: false,
        completed_at: null,
        created_at: '2026-05-12T08:00:00.000Z',
        modified_at: '2026-05-12T08:00:00.000Z',
        permalink_url: 'https://app.asana.com/0/B',
      },
    ];
    const stories: Record<string, unknown[]> = {
      A: [
        {
          gid: 's1',
          type: 'comment',
          text: 'Looks great, ship it',
          created_at: '2026-05-13T11:00:00.000Z',
          created_by: { name: 'Client' },
        },
        {
          gid: 's2',
          type: 'comment',
          text: 'stale note',
          created_at: '2026-05-01T11:00:00.000Z', // before the window
          created_by: { name: 'Dana' },
        },
      ],
      B: [
        {
          gid: 's3',
          type: 'system',
          resource_subtype: 'section_changed',
          text: 'moved this task to In Progress',
          created_at: '2026-05-12T09:00:00.000Z',
          created_by: { name: 'Dana' },
        },
        {
          gid: 's4',
          type: 'system',
          resource_subtype: 'marked_complete', // duplicates task fields, skipped
          text: 'completed this task',
          created_at: '2026-05-12T09:30:00.000Z',
          created_by: { name: 'Dana' },
        },
      ],
    };

    const connector = createAsanaConnector({
      accessToken: 'tok',
      projectGids: ['P'],
      fetch: mockFetch((url) => {
        const storyMatch = url.pathname.match(/\/tasks\/(\w+)\/stories$/);
        if (storyMatch) return { body: { data: stories[storyMatch[1]!] ?? [] } };
        if (url.pathname.endsWith('/tasks')) return { body: { data: tasks } };
        throw new Error(`unexpected path: ${url.pathname}`);
      }),
    });

    const digest = await connector.fetchActivity(WINDOW);

    expect(digest.stats).toEqual({ itemsScanned: 2, eventsFound: 4 });
    expect(digest.warnings).toEqual([]);
    expect(digest.events.map((e) => e.kind)).toEqual([
      'task_created', // B created  2026-05-12T08:00
      'task_updated', // B section  2026-05-12T09:00
      'task_completed', // A done   2026-05-13T10:00
      'comment', // A comment       2026-05-13T11:00
    ]);

    const comment = digest.events[3]!;
    expect(comment.actor).toBe('Client');
    expect(comment.detail).toBe('Looks great, ship it');
    expect(comment.url).toBe('https://app.asana.com/0/A');
    expect(comment.id).toBe('asana:story:s1');
  });

  it('follows cursor pagination across task pages', async () => {
    const connector = createAsanaConnector({
      accessToken: 'tok',
      projectGids: ['P'],
      fetch: mockFetch((url) => {
        if (url.pathname.endsWith('/stories')) return { body: { data: [] } };
        if (url.pathname.endsWith('/tasks')) {
          const offset = url.searchParams.get('offset');
          if (!offset) {
            return {
              body: {
                data: [{ gid: 'T1', name: 'Task one', created_at: '2026-05-12T00:00:00.000Z' }],
                next_page: { offset: 'page-2' },
              },
            };
          }
          return {
            body: {
              data: [{ gid: 'T2', name: 'Task two', created_at: '2026-05-13T00:00:00.000Z' }],
              next_page: null,
            },
          };
        }
        throw new Error(`unexpected path: ${url.pathname}`);
      }),
    });

    const digest = await connector.fetchActivity(WINDOW);

    expect(digest.stats.itemsScanned).toBe(2);
    expect(digest.events.map((e) => e.title)).toEqual(['Task one', 'Task two']);
  });

  it('merges events across multiple tracked projects, sorted by timestamp', async () => {
    const connector = createAsanaConnector({
      accessToken: 'tok',
      projectGids: ['P1', 'P2'],
      fetch: mockFetch((url) => {
        if (url.pathname.endsWith('/stories')) return { body: { data: [] } };
        if (url.pathname.endsWith('/tasks')) {
          const project = url.searchParams.get('project');
          if (project === 'P1') {
            return {
              body: {
                data: [
                  { gid: 'A', name: 'Homepage tweak', created_at: '2026-05-13T08:00:00.000Z' },
                ],
              },
            };
          }
          if (project === 'P2') {
            return {
              body: {
                data: [
                  { gid: 'B', name: 'Brand refresh kickoff', created_at: '2026-05-12T08:00:00.000Z' },
                ],
              },
            };
          }
        }
        throw new Error(`unexpected request: ${url.pathname} project=${url.searchParams.get('project')}`);
      }),
    });

    const digest = await connector.fetchActivity(WINDOW);
    expect(digest.stats.itemsScanned).toBe(2);
    // Events are merged across both projects and sorted globally, P2's earlier
    // task comes first even though P1 was pulled first.
    expect(digest.events.map((e) => e.title)).toEqual([
      'Brand refresh kickoff',
      'Homepage tweak',
    ]);
  });
});

// --- listProjects() --------------------------------------------------------

describe('AsanaConnector.listProjects', () => {
  it('returns the active projects in a workspace', async () => {
    const connector = createAsanaConnector({
      accessToken: 'tok',
      fetch: mockFetch((url) => {
        expect(url.pathname.endsWith('/projects')).toBe(true);
        expect(url.searchParams.get('workspace')).toBe('w1');
        return {
          body: {
            data: [
              { gid: 'p1', name: 'Website Redesign' },
              { gid: 'p2', name: 'Brand Refresh' },
            ],
          },
        };
      }),
    });

    const projects = await connector.listProjects('w1');

    expect(projects).toEqual([
      { gid: 'p1', name: 'Website Redesign' },
      { gid: 'p2', name: 'Brand Refresh' },
    ]);
  });

  it('rejects when no workspace id is given', async () => {
    const connector = createAsanaConnector({ accessToken: 'tok', fetch: mockFetch(() => ({ body: {} })) });

    await expect(connector.listProjects('   ')).rejects.toMatchObject({ code: 'config' });
  });
});

// --- verify route ----------------------------------------------------------

describe('POST /api/connectors/[source]/verify', () => {
  it('returns 400 for a non-JSON body', async () => {
    const res = await verifyRoute(
      new Request('http://test/verify', { method: 'POST', body: 'nope' }),
      asanaCtx,
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('bad_request');
  });

  it('returns 400 when the access token is missing', async () => {
    const res = await verifyRoute(
      new Request('http://test/verify', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
      asanaCtx,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown connector source', async () => {
    const res = await verifyRoute(
      new Request('http://test/verify', {
        method: 'POST',
        body: JSON.stringify({ accessToken: 'tok' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ source: 'nope' }) },
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/connectors/[source]/projects', () => {
  it('returns 400 for a non-JSON body', async () => {
    const res = await projectsRoute(
      new Request('http://test/projects', { method: 'POST', body: 'nope' }),
      asanaCtx,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when workspaceId is missing', async () => {
    const res = await projectsRoute(
      new Request('http://test/projects', {
        method: 'POST',
        body: JSON.stringify({ accessToken: 'tok' }),
        headers: { 'content-type': 'application/json' },
      }),
      asanaCtx,
    );
    expect(res.status).toBe(400);
  });
});

// --- config guards ---------------------------------------------------------

describe('createAsanaConnector config', () => {
  it('throws a config error when the access token is empty', () => {
    expect(() => createAsanaConnector({ accessToken: '   ' })).toThrowError(ConnectorError);
  });
});
