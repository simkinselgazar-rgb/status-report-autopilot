/**
 * Linear connector, the second source integration.
 *
 * Reads issues and comments from one or more Linear projects and normalizes
 * them into {@link SourceEvent}s for the reporting window. Token-agnostic:
 * accepts a Linear personal API key or an OAuth access token (the auth header
 * form differs, so it is detected from the token prefix).
 *
 * Linear's API is GraphQL, one endpoint, cursor pagination, and errors that
 * can arrive inside a `200` response body.
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

const SOURCE = 'linear' as const;
const API_URL = 'https://api.linear.app/graphql';
const PAGE_LIMIT = 50;
const COMMENTS_PER_ISSUE = 25;

export interface LinearConnectorConfig {
  /** A Linear personal API key (`lin_api_…`) or an OAuth access token. */
  accessToken: string;
  /** The Linear projects this connector tracks. Required by `fetchActivity`. */
  projectIds?: readonly string[];
  /** Injectable fetch, defaults to the global. Override in tests. */
  fetch?: typeof fetch;
}

export interface LinearProject {
  id: string;
  name: string;
}

export interface LinearConnector extends Connector {
  /** Teams visible to the connected token, as workspaces. */
  listWorkspaces(): Promise<ConnectorWorkspace[]>;
  /** Projects in a team, used by onboarding. */
  listProjects(workspaceId: string): Promise<LinearProject[]>;
}

// --- GraphQL response schemas (boundary validation) ------------------------

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

const viewerSchema = z.object({
  viewer: z.object({ name: z.string(), email: z.string().optional() }),
  teams: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string() })) }),
});

const projectsSchema = z.object({
  team: z
    .object({
      projects: z.object({
        nodes: z.array(z.object({ id: z.string(), name: z.string() })),
        pageInfo: pageInfoSchema,
      }),
    })
    .nullable(),
});

const issueSchema = z.object({
  id: z.string(),
  identifier: z.string().optional(),
  title: z.string().nullable().optional(),
  url: z.string().optional(),
  createdAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  assignee: z.object({ name: z.string() }).nullable().optional(),
  comments: z
    .object({
      nodes: z.array(
        z.object({
          id: z.string(),
          body: z.string().nullable().optional(),
          createdAt: z.string(),
          user: z.object({ name: z.string() }).nullable().optional(),
        }),
      ),
    })
    .optional(),
});

const activitySchema = z.object({
  project: z
    .object({
      issues: z.object({ nodes: z.array(issueSchema), pageInfo: pageInfoSchema }),
    })
    .nullable(),
});

type LinearIssue = z.infer<typeof issueSchema>;

const errorsSchema = z
  .array(
    z.object({
      message: z.string().optional(),
      extensions: z.object({ code: z.string().optional(), type: z.string().optional() }).optional(),
    }),
  )
  .optional();

// --- GraphQL documents -----------------------------------------------------

const VIEWER_QUERY = `query Viewer {
  viewer { name email }
  teams(first: 250) { nodes { id name } }
}`;

const PROJECTS_QUERY = `query TeamProjects($teamId: String!, $after: String) {
  team(id: $teamId) {
    projects(first: 100, after: $after) {
      nodes { id name }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const ACTIVITY_QUERY = `query ProjectActivity($projectId: String!, $filter: IssueFilter, $after: String) {
  project(id: $projectId) {
    issues(first: ${PAGE_LIMIT}, after: $after, filter: $filter) {
      nodes {
        id
        identifier
        title
        url
        createdAt
        completedAt
        assignee { name }
        comments(first: ${COMMENTS_PER_ISSUE}) {
          nodes { id body createdAt user { name } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

// --- Connector -------------------------------------------------------------

export function createLinearConnector(config: LinearConnectorConfig): LinearConnector {
  const doFetch = config.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new ConnectorError(SOURCE, 'config', 'No fetch implementation is available.');
  }
  const token = config.accessToken?.trim();
  if (!token) {
    throw new ConnectorError(SOURCE, 'config', 'A Linear access token is required.');
  }
  // Personal API keys go raw; OAuth access tokens use the Bearer scheme.
  const authHeader = token.startsWith('lin_oauth_') ? `Bearer ${token}` : token;

  async function rawRequest(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const res = await fetchWithRetry(SOURCE, 'Linear', () =>
      doFetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      }),
    );

    if (res.status === 401 || res.status === 403) {
      throw new ConnectorError(SOURCE, 'auth', 'Linear rejected the access token.', {
        status: res.status,
      });
    }
    if (res.status === 429) {
      throw new ConnectorError(SOURCE, 'rate_limited', 'Linear rate limit exceeded.', {
        status: 429,
      });
    }
    if (!res.ok) {
      throw new ConnectorError(SOURCE, 'unknown', `Linear request failed (${res.status}).`, {
        status: res.status,
      });
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (cause) {
      throw new ConnectorError(SOURCE, 'bad_response', 'Linear returned an unreadable response.', {
        cause,
      });
    }
    assertNoGraphqlErrors(json);
    return json;
  }

  async function graphql<T extends z.ZodTypeAny>(
    query: string,
    variables: Record<string, unknown>,
    dataSchema: T,
  ): Promise<z.infer<T>> {
    const json = await rawRequest(query, variables);
    const parsed = z.object({ data: dataSchema }).safeParse(json);
    if (!parsed.success) {
      throw new ConnectorError(SOURCE, 'bad_response', 'Linear response did not match the expected shape.', {
        cause: parsed.error,
      });
    }
    return parsed.data.data;
  }

  async function verify(): Promise<ConnectorIdentity> {
    const data = await graphql(VIEWER_QUERY, {}, viewerSchema);
    return {
      source: SOURCE,
      accountName: data.viewer.name,
      accountEmail: data.viewer.email,
      workspaces: data.teams.nodes.map((t) => ({ id: t.id, name: t.name })),
    };
  }

  async function listWorkspaces(): Promise<ConnectorWorkspace[]> {
    return (await verify()).workspaces;
  }

  async function listProjects(workspaceId: string): Promise<LinearProject[]> {
    const teamId = workspaceId?.trim();
    if (!teamId) {
      throw new ConnectorError(SOURCE, 'config', 'A team id is required to list projects.');
    }
    const projects: LinearProject[] = [];
    let after: string | undefined;
    do {
      const data = await graphql(PROJECTS_QUERY, { teamId, after }, projectsSchema);
      if (!data.team) {
        throw new ConnectorError(SOURCE, 'not_found', 'That Linear team was not found.');
      }
      projects.push(...data.team.projects.nodes);
      after = data.team.projects.pageInfo.hasNextPage
        ? (data.team.projects.pageInfo.endCursor ?? undefined)
        : undefined;
    } while (after);
    return projects;
  }

  /** Pulls events for one Linear project. */
  async function fetchProjectActivity(
    projectId: string,
    window: ConnectorWindow,
  ): Promise<{ events: SourceEvent[]; itemsScanned: number }> {
    const filter = { updatedAt: { gte: window.since.toISOString() } };
    const issues: LinearIssue[] = [];
    let after: string | undefined;
    do {
      const data = await graphql(ACTIVITY_QUERY, { projectId, filter, after }, activitySchema);
      if (!data.project) {
        throw new ConnectorError(SOURCE, 'not_found', 'That Linear project was not found.');
      }
      issues.push(...data.project.issues.nodes);
      after = data.project.issues.pageInfo.hasNextPage
        ? (data.project.issues.pageInfo.endCursor ?? undefined)
        : undefined;
    } while (after);

    const events: SourceEvent[] = [];
    for (const issue of issues) {
      const title = issueTitle(issue);
      if (issue.createdAt && inWindow(issue.createdAt, window)) {
        events.push({
          id: `linear:issue-created:${issue.id}`,
          source: SOURCE,
          kind: 'task_created',
          title,
          actor: issue.assignee?.name,
          timestamp: issue.createdAt,
          url: issue.url,
        });
      }
      if (issue.completedAt && inWindow(issue.completedAt, window)) {
        events.push({
          id: `linear:issue-completed:${issue.id}`,
          source: SOURCE,
          kind: 'task_completed',
          title,
          actor: issue.assignee?.name,
          timestamp: issue.completedAt,
          url: issue.url,
        });
      }
      for (const comment of issue.comments?.nodes ?? []) {
        const text = comment.body?.trim();
        if (!text || !inWindow(comment.createdAt, window)) continue;
        events.push({
          id: `linear:comment:${comment.id}`,
          source: SOURCE,
          kind: 'comment',
          title,
          detail: text,
          actor: comment.user?.name,
          timestamp: comment.createdAt,
          url: issue.url,
        });
      }
    }
    return { events, itemsScanned: issues.length };
  }

  async function fetchActivity(window: ConnectorWindow): Promise<ActivityDigest> {
    const projectIds = (config.projectIds ?? [])
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id));
    if (projectIds.length === 0) {
      throw new ConnectorError(SOURCE, 'config', 'No Linear project is selected for this connector.');
    }
    assertWindow(SOURCE, window);

    const events: SourceEvent[] = [];
    let itemsScanned = 0;
    for (const projectId of projectIds) {
      const pull = await fetchProjectActivity(projectId, window);
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

  return { source: SOURCE, verify, fetchActivity, listWorkspaces, listProjects };
}

// --- Pure helpers ----------------------------------------------------------

function issueTitle(issue: LinearIssue): string {
  return issue.title?.trim() || issue.identifier || 'Untitled issue';
}

/** GraphQL transports failures inside a 200, surface them as typed errors. */
function assertNoGraphqlErrors(json: unknown): void {
  if (typeof json !== 'object' || json === null) return;
  const parsed = errorsSchema.safeParse((json as { errors?: unknown }).errors);
  if (!parsed.success || !parsed.data || parsed.data.length === 0) return;

  const errors = parsed.data;
  const text = errors
    .map((e) => `${e.message ?? ''} ${e.extensions?.code ?? ''} ${e.extensions?.type ?? ''}`)
    .join(' ')
    .toLowerCase();
  if (text.includes('authentic') || text.includes('unauthorized')) {
    throw new ConnectorError(SOURCE, 'auth', 'Linear rejected the access token.');
  }
  if (text.includes('ratelimit')) {
    throw new ConnectorError(SOURCE, 'rate_limited', 'Linear rate limit exceeded.');
  }
  throw new ConnectorError(SOURCE, 'bad_response', errors[0]?.message ?? 'Linear returned an error.');
}
