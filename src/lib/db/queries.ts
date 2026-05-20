/**
 * Product-DB query layer. The dashboard and the report API routes go through
 * here, they never touch Drizzle directly.
 *
 * `toClientReport` is pure (no DB) so the join-to-view-model mapping is unit
 * tested without a database.
 */

import { and, desc, eq, gte, ne, or } from 'drizzle-orm';

import type { SourceEvent } from '@/lib/connectors/types';
import type { ClientReport, ReportStatus } from '@/lib/dashboard/types';
import type { NarrativeResult, StatusReportDraft } from '@/lib/reports/types';
import { getDb } from './index';
import { clients, reports, type ClientRow, type NewClientRow, type ReportRow } from './schema';

/** Fold a joined report + client row pair into the dashboard view model. */
export function toClientReport(report: ReportRow, client: ClientRow): ClientReport {
  return {
    id: report.id,
    shareToken: report.shareToken,
    clientName: client.name,
    periodLabel: report.periodLabel,
    status: report.status,
    generatedAt: report.generatedAt,
    eventsUsed: report.eventsUsed,
    draft: report.draft ?? null,
    insufficientReason: report.insufficientReason ?? null,
    sourceEvents: report.sourceEvents,
    recipient: client.recipient,
    sentAt: report.sentAt ?? null,
  };
}

/** Sent reports older than this drop off the dashboard (still live at /r/[token]). */
const DASHBOARD_SENT_WINDOW_DAYS = 35;

/**
 * The dashboard queue, newest first. Every actionable report (draft /
 * insufficient) is included regardless of age, a pending item is never hidden
 *, plus recently sent reports for reference. Older sent reports remain in the
 * DB and on their share link.
 */
export async function listReports(): Promise<ClientReport[]> {
  const sentCutoff = new Date(
    Date.now() - DASHBOARD_SENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rows = await getDb()
    .select()
    .from(reports)
    .innerJoin(clients, eq(reports.clientId, clients.id))
    .where(or(ne(reports.status, 'sent'), gte(reports.generatedAt, sentCutoff)))
    .orderBy(desc(reports.generatedAt));
  return rows.map((row) => toClientReport(row.reports, row.clients));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Look up a single report by its public share token. Returns `null` for an
 * unknown or malformed token, the caller decides what a missing report means
 * (the public route 404s). A non-uuid token short-circuits before the DB.
 */
export async function getReportByShareToken(token: string): Promise<ClientReport | null> {
  if (!UUID_RE.test(token)) return null;
  const rows = await getDb()
    .select()
    .from(reports)
    .innerJoin(clients, eq(reports.clientId, clients.id))
    .where(eq(reports.shareToken, token))
    .limit(1);
  const row = rows[0];
  return row ? toClientReport(row.reports, row.clients) : null;
}

/** Look up a report by id. `null` for an unknown or malformed id. */
export async function getReportById(id: string): Promise<ClientReport | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await getDb()
    .select()
    .from(reports)
    .innerJoin(clients, eq(reports.clientId, clients.id))
    .where(eq(reports.id, id))
    .limit(1);
  const row = rows[0];
  return row ? toClientReport(row.reports, row.clients) : null;
}

/** Persist a PM inline-edit to the draft. Returns `false` if the id is unknown. */
export async function updateReportDraft(id: string, draft: StatusReportDraft): Promise<boolean> {
  const updated = await getDb()
    .update(reports)
    .set({ draft, updatedAt: new Date() })
    .where(eq(reports.id, id))
    .returning({ id: reports.id });
  return updated.length > 0;
}

/**
 * Move a report between states. `sent` stamps `sentAt`; any other status clears
 * it (so an undo returns the report to a clean draft). `false` for an unknown id.
 */
export async function setReportStatus(id: string, status: ReportStatus): Promise<boolean> {
  const sentAt = status === 'sent' ? new Date().toISOString() : null;
  const updated = await getDb()
    .update(reports)
    .set({ status, sentAt, updatedAt: new Date() })
    .where(eq(reports.id, id))
    .returning({ id: reports.id });
  return updated.length > 0;
}

export interface NewClientWithReport {
  client: Omit<NewClientRow, 'id' | 'createdAt'>;
  report: {
    /** Monday (`YYYY-MM-DD`) of the covered week, the report's period key. */
    periodStart: string;
    periodLabel: string;
    eventsUsed: number;
    draft: StatusReportDraft;
    sourceEvents: SourceEvent[];
  };
}

/** Every client on the roster, recurring generation iterates these. */
export async function listClients(): Promise<ClientRow[]> {
  return getDb().select().from(clients);
}

/** True when a report already exists for this client + reporting week. */
export async function reportExistsForPeriod(
  clientId: string,
  periodStart: string,
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.clientId, clientId), eq(reports.periodStart, periodStart)))
    .limit(1);
  return rows.length > 0;
}

export interface NewReport {
  clientId: string;
  /** Monday (`YYYY-MM-DD`) of the covered week. */
  periodStart: string;
  result: NarrativeResult;
  sourceEvents: SourceEvent[];
}

/**
 * Insert a recurring report. Idempotent on `(clientId, periodStart)`, a
 * second insert for the same week no-ops. Returns true when a row was written.
 */
export async function createReport(input: NewReport): Promise<boolean> {
  const { clientId, periodStart, result, sourceEvents } = input;
  const inserted = await getDb()
    .insert(reports)
    .values({
      clientId,
      periodStart,
      periodLabel: result.periodLabel,
      status: result.status === 'drafted' ? 'draft' : 'insufficient',
      generatedAt: new Date().toISOString(),
      eventsUsed: result.eventsUsed,
      draft: result.status === 'drafted' ? result.draft : null,
      insufficientReason: result.status === 'insufficient' ? result.reason : null,
      sourceEvents,
    })
    .onConflictDoNothing({ target: [reports.clientId, reports.periodStart] })
    .returning({ id: reports.id });
  return inserted.length > 0;
}

/**
 * Onboarding commit, insert a client and its first (draft) report in one
 * transaction, so a failed report insert never leaves an orphan client.
 * Returns the new client id.
 */
export async function createClientWithReport(input: NewClientWithReport): Promise<string> {
  return getDb().transaction(async (tx) => {
    const [client] = await tx
      .insert(clients)
      .values(input.client)
      .returning({ id: clients.id });
    await tx.insert(reports).values({
      clientId: client!.id,
      periodStart: input.report.periodStart,
      periodLabel: input.report.periodLabel,
      status: 'draft',
      generatedAt: new Date().toISOString(),
      eventsUsed: input.report.eventsUsed,
      draft: input.report.draft,
      insufficientReason: null,
      sourceEvents: input.report.sourceEvents,
      sentAt: null,
    });
    return client!.id;
  });
}
