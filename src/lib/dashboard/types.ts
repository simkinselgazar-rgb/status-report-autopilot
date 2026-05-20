/**
 * Dashboard data shapes. Until the product DB lands, the dashboard runs on the
 * in-memory seed (`seed.ts`); these types are what persistence will store.
 */

import type { SourceEvent } from '@/lib/connectors/types';
import type { StatusReportDraft } from '@/lib/reports/types';

export type ReportStatus = 'draft' | 'sent' | 'insufficient';

export interface ClientReport {
  id: string;
  /** Capability token for the public `/r/[token]` link. */
  shareToken: string;
  clientName: string;
  periodLabel: string;
  status: ReportStatus;
  /** ISO, when the agent produced this draft. */
  generatedAt: string;
  eventsUsed: number;
  /** The narrative, `null` when the week was too quiet to draft. */
  draft: StatusReportDraft | null;
  /** Why the week was insufficient; `null` otherwise. */
  insufficientReason: string | null;
  /** The activity the agent read, powers the provenance drawer. */
  sourceEvents: SourceEvent[];
  /** Client-facing recipient an approved report sends to. */
  recipient: string;
  /** ISO, when the report was approved & sent; `null` until then. */
  sentAt: string | null;
}
