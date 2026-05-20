/**
 * Asana connector, the first real source integration.
 *
 * Reads tasks, milestones, and activity history ("who moved what") from a
 * single Asana project and normalizes them into {@link SourceEvent}s for the
 * reporting window. Token-agnostic: accepts a Personal Access Token or an
 * OAuth bearer token, the hosted OAuth flow lands later without touching this
 * file.
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

const SOURCE = 'asana' as const;
const API_BASE = 'https://app.asana.com/api/1.0';
const PAGE_LIMIT = 100; // Asana's max page size
const STORY_CONCURRENCY = 5; // parallel per-task story fetches
const MAX_TASKS_FOR_STORIES = 250; // big-launch guardrail, see design brief §7

export interface AsanaConnectorConfig {
  /** Asana access token, a Personal Access Token or an OAuth bearer token. */
  accessToken: string;
  /** The Asana project this connector tracks. Required by `fetchActivity`. */
  projectGid?: string;
  /** Injectable fetch, defaults to the global. Override in tests. */
  fetch?: typeof fetch;
}

export interface AsanaProject {
  gid: string;
  name: string;
}

export interface AsanaConnector extends Connector {
  /** Workspaces visible to the connected token. */
  listWorkspaces(): Promise<ConnectorWorkspace[]>;
  /** Active (non-archived) projects in a workspace, used by onboarding. */
  listProjects(workspaceGid: string): Promise<AsanaProject[]>;
}

// --- Asana API schemas (boundary validation) -------------------------------

const workspaceSchema = z.object({ gid: z.string(), name: z.string() });

const userSchema = z.object({
  gid: z.string(),
  name: z.string(),
  email: z.string().optional(),
  workspaces: z.array(workspaceSchema).optional(),
});

const projectSchema = z.object({ gid: z.string(), name: z.string() });

const taskSchema = z.object({
  gid: z.string(),
  name: z.string().nullable().optional(),
  resource_subtype: z.string().optional(), // 'default_task' | 'milestone' | ...
  completed: z.boolean().optional(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  modified_at: z.string().nullable().optional(),
  permalink_url: z.string().optional(),
  assignee: z.object({ name: z.string() }).nullable().optional(),
});

const storySchema = z.object({
  gid: z.string(),
  created_at: z.string(),
  created_by: z.object({ name: z.string() }).nullable().optional(),
  type: z.string().optional(), // 'comment' | 'system'
  resource_subtype: z.string().optional(),
  text: z.string().nullable().optional(),
});

type AsanaTask = z.infer<typeof taskSchema>;
type AsanaStory = z.infer<typeof storySchema>;

const nextPageSchema = z.object({ offset: z.string() }).nullable().optional();

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, next_page: nextPageSchema });
}

/** System-story subtypes that duplicate task-field events or are pure noise. */
const SKIP_STORY_SUBTYPES = new Set([
  'marked_complete',
  'marked_incomplete',
  'marked_today',
  'liked',
  'unliked',
]);

// --- Connector -------------------------------------------------------------

export function createAsanaConnector(config: AsanaConnectorConfig): AsanaConnector {
  const doFetch = config.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new ConnectorError(SOURCE, 'config', 'No fetch implementation is available.');
  }
  const token = config.accessToken?.trim();
  if (!token) {
    throw new ConnectorError(SOURCE, 'config', 'An Asana access token is required.');
  }

  async function rawRequest(
    path: string,
    query: Record<string, string | number | boolean | undefined>,
  ): Promise<unknown> {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const res = await fetchWithRetry(SOURCE, 'Asana', () =>
      doFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }),
    );

    if (res.ok) {
      try {
        return await res.json();
      } catch (cause) {
        throw new ConnectorError(SOURCE, 'bad_response', 'Asana returned an unreadable response.', {
          cause,
        });
      }
    }
    if (res.status === 401 || res.status === 403) {
      throw new ConnectorError(SOURCE, 'auth', 'Asana rejected the access token.', {
        status: res.status,
      });
    }
    if (res.status === 404) {
      throw new ConnectorError(SOURCE, 'not_found', 'The Asana resource was not found.', {
        status: 404,
      });
    }
    if (res.status === 429) {
      throw new ConnectorError(SOURCE, 'rate_limited', 'Asana rate limit exceeded.', { status: 429 });
    }
    throw new ConnectorError(SOURCE, 'unknown', `Asana request failed (${res.status}).`, {
      status: res.status,
    });
  }

  async function request<T extends z.ZodTypeAny>(
    path: string,
    query: Record<string, string | number | boolean | undefined>,
    dataSchema: T,
  ): Promise<z.infer<T>> {
    const json = await rawRequest(path, query);
    const parsed = envelope(dataSchema).safeParse(json);
    if (!parsed.success) {
      throw new ConnectorError(SOURCE, 'bad_response', 'Asana response did not match the expected shape.', {
        cause: parsed.error,
      });
    }
    return parsed.data.data;
  }

  async function requestList<T extends z.ZodTypeAny>(
    path: string,
    query: Record<string, string | number | boolean | undefined>,
    itemSchema: T,
  ): Promise<z.infer<T>[]> {
    const items: z.infer<T>[] = [];
    let offset: string | undefined;
    do {
      const json = await rawRequest(path, { ...query, limit: PAGE_LIMIT, offset });
      const parsed = envelope(z.array(itemSchema)).safeParse(json);
      if (!parsed.success) {
        throw new ConnectorError(
          SOURCE,
          'bad_response',
          'Asana list response did not match the expected shape.',
          { cause: parsed.error },
        );
      }
      items.push(...parsed.data.data);
      offset = parsed.data.next_page?.offset;
    } while (offset);
    return items;
  }

  async function verify(): Promise<ConnectorIdentity> {
    const user = await request('/users/me', { opt_fields: 'name,email,workspaces.name' }, userSchema);
    return {
      source: SOURCE,
      accountName: user.name,
      accountEmail: user.email,
      workspaces: (user.workspaces ?? []).map((w) => ({ id: w.gid, name: w.name })),
    };
  }

  async function listWorkspaces(): Promise<ConnectorWorkspace[]> {
    return (await verify()).workspaces;
  }

  async function listProjects(workspaceGid: string): Promise<AsanaProject[]> {
    const gid = workspaceGid?.trim();
    if (!gid) {
      throw new ConnectorError(SOURCE, 'config', 'A workspace id is required to list projects.');
    }
    const projects = await requestList(
      '/projects',
      { workspace: gid, archived: false, opt_fields: 'name' },
      projectSchema,
    );
    return projects.map((p) => ({ gid: p.gid, name: p.name }));
  }

  async function fetchActivity(window: ConnectorWindow): Promise<ActivityDigest> {
    const projectGid = config.projectGid?.trim();
    if (!projectGid) {
      throw new ConnectorError(SOURCE, 'config', 'No Asana project is selected for this connector.');
    }
    assertWindow(SOURCE, window);

    const warnings: string[] = [];
    const tasks = await requestList(
      '/tasks',
      {
        project: projectGid,
        modified_since: window.since.toISOString(),
        opt_fields:
          'name,resource_subtype,completed,completed_at,created_at,modified_at,permalink_url,assignee.name',
      },
      taskSchema,
    );

    let tasksForStories = tasks;
    if (tasks.length > MAX_TASKS_FOR_STORIES) {
      warnings.push(
        `High-activity week: ${tasks.length} tasks changed, reading detailed history for the ${MAX_TASKS_FOR_STORIES} most recently updated.`,
      );
      tasksForStories = [...tasks]
        .sort((a, b) => (b.modified_at ?? '').localeCompare(a.modified_at ?? ''))
        .slice(0, MAX_TASKS_FOR_STORIES);
    }

    const events: SourceEvent[] = [];

    // Task-level events derived from task fields.
    for (const task of tasks) {
      const title = taskTitle(task);
      const isMilestone = task.resource_subtype === 'milestone';

      if (task.created_at && inWindow(task.created_at, window)) {
        events.push({
          id: `asana:task-created:${task.gid}`,
          source: SOURCE,
          kind: 'task_created',
          title,
          actor: task.assignee?.name,
          timestamp: task.created_at,
          url: task.permalink_url,
        });
      }
      if (task.completed && task.completed_at && inWindow(task.completed_at, window)) {
        events.push({
          id: `asana:task-completed:${task.gid}`,
          source: SOURCE,
          kind: isMilestone ? 'milestone_completed' : 'task_completed',
          title,
          actor: task.assignee?.name,
          timestamp: task.completed_at,
          url: task.permalink_url,
        });
      }
    }

    // Story-level events, comments and granular activity, with actor attribution.
    const storyResults = await mapWithConcurrency(tasksForStories, STORY_CONCURRENCY, async (task) => {
      try {
        const stories = await requestList(
          `/tasks/${task.gid}/stories`,
          { opt_fields: 'created_at,created_by.name,type,resource_subtype,text' },
          storySchema,
        );
        return { task, stories };
      } catch (error) {
        // A task can be deleted between the task pull and the story pull.
        if (error instanceof ConnectorError && error.code === 'not_found') {
          return { task, stories: [] as AsanaStory[] };
        }
        throw error;
      }
    });

    for (const { task, stories } of storyResults) {
      const title = taskTitle(task);
      for (const story of stories) {
        if (!inWindow(story.created_at, window)) continue;
        const mapped = mapStory(task, title, story);
        if (mapped) events.push(mapped);
      }
    }

    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      source: SOURCE,
      window,
      fetchedAt: new Date().toISOString(),
      events,
      warnings,
      stats: { itemsScanned: tasks.length, eventsFound: events.length },
    };
  }

  return { source: SOURCE, verify, fetchActivity, listWorkspaces, listProjects };
}

// --- Pure helpers ----------------------------------------------------------

function taskTitle(task: AsanaTask): string {
  return task.name?.trim() || 'Untitled task';
}

function mapStory(task: AsanaTask, title: string, story: AsanaStory): SourceEvent | null {
  const text = story.text?.trim();
  const base = {
    id: `asana:story:${story.gid}`,
    source: SOURCE,
    title,
    detail: text,
    actor: story.created_by?.name,
    timestamp: story.created_at,
    url: task.permalink_url,
  } as const;

  if (story.type === 'comment') {
    return text ? { ...base, kind: 'comment' } : null;
  }
  // System story: skip completion stories (covered by task fields) and noise.
  if (story.resource_subtype && SKIP_STORY_SUBTYPES.has(story.resource_subtype)) return null;
  return text ? { ...base, kind: 'task_updated' } : null;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}
