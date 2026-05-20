/**
 * Source-agnostic connector contracts.
 *
 * Every project-tool integration (Asana, Linear, Slack, Zoom, Microsoft Teams)
 * implements {@link Connector} and emits {@link ActivityDigest}. The
 * narrative-generation agent consumes a digest without knowing its source.
 */

import { z } from 'zod';

export type SourceId = 'asana' | 'linear' | 'slack' | 'zoom' | 'teams';

export interface ConnectorWindow {
  /** Inclusive start of the reporting period. */
  since: Date;
  /** Inclusive end of the reporting period. */
  until: Date;
}

export type SourceEventKind =
  | 'task_completed'
  | 'task_created'
  | 'milestone_completed'
  | 'comment'
  | 'task_updated'
  | 'meeting';

export interface SourceEvent {
  /** Stable, source-scoped id, safe to dedupe on across pulls. */
  id: string;
  source: SourceId;
  kind: SourceEventKind;
  /** Human-readable subject, usually the task/issue name. */
  title: string;
  /** Supporting text, a comment body or a system-event description. */
  detail?: string;
  /** Who performed the action, when the source attributes it. */
  actor?: string;
  /** ISO-8601 timestamp the event occurred. */
  timestamp: string;
  /** Deep link back to the item in the source tool. */
  url?: string;
}

/**
 * Runtime schema for {@link SourceEvent}, boundary validation when an event
 * crosses an API (the onboarding commit persists the digest's events). Keep the
 * enums in sync with `SourceId` and `SourceEventKind`.
 */
export const sourceEventSchema = z.object({
  id: z.string(),
  source: z.enum(['asana', 'linear', 'slack', 'zoom', 'teams']),
  kind: z.enum([
    'task_completed',
    'task_created',
    'milestone_completed',
    'comment',
    'task_updated',
    'meeting',
  ]),
  title: z.string(),
  detail: z.string().optional(),
  actor: z.string().optional(),
  timestamp: z.string(),
  url: z.string().optional(),
});

export interface ActivityDigest {
  source: SourceId;
  window: ConnectorWindow;
  /** ISO-8601, when this digest was pulled. */
  fetchedAt: string;
  /** Normalized events inside the window, oldest-first. */
  events: SourceEvent[];
  /** Non-fatal issues (partial pull, capped history) surfaced to the PM. */
  warnings: string[];
  stats: {
    /** Source items inspected. Asana tasks, Linear issues, etc. */
    itemsScanned: number;
    eventsFound: number;
  };
}

export interface ConnectorWorkspace {
  id: string;
  name: string;
}

export interface ConnectorIdentity {
  source: SourceId;
  /** Display name of the connected account. */
  accountName: string;
  accountEmail?: string;
  workspaces: ConnectorWorkspace[];
}

/**
 * The contract every source connector implements. The narrative agent depends
 * on this interface, never on a concrete connector.
 */
export interface Connector {
  readonly source: SourceId;
  /** Confirm credentials work and report the connected identity. */
  verify(): Promise<ConnectorIdentity>;
  /** Pull normalized activity for the given reporting window. */
  fetchActivity(window: ConnectorWindow): Promise<ActivityDigest>;
}

export type ConnectorErrorCode =
  | 'auth' // bad or expired credentials
  | 'not_found' // workspace, project, or resource missing
  | 'rate_limited' // exhausted retries against a 429
  | 'network' // transport failure
  | 'bad_response' // source returned a shape we cannot parse
  | 'config' // connector misconfigured (e.g. no project selected)
  | 'unknown';

/** Every connector failure surfaces as this typed error. */
export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly source: SourceId;
  readonly status?: number;

  constructor(
    source: SourceId,
    code: ConnectorErrorCode,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ConnectorError';
    this.source = source;
    this.code = code;
    this.status = options?.status;
  }
}
