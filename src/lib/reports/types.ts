/**
 * The status-report draft, the structured narrative the LLM produces and the
 * dashboard, PDF, and email all render. This is the canonical draft shape.
 */

import { z } from 'zod';

import type { Length, Tone } from '@/lib/onboarding/types';

export const reportSectionKinds = ['shipped', 'in_flight', 'blockers', 'next'] as const;
export type ReportSectionKind = (typeof reportSectionKinds)[number];

/** Display titles per section, fixed and branded, not LLM-generated. */
export const SECTION_TITLES: Record<ReportSectionKind, string> = {
  shipped: 'Shipped this week',
  in_flight: 'In flight',
  blockers: 'Blockers & asks',
  next: "What's next",
};

export const reportItemSchema = z.object({
  text: z.string().describe('One narrative sentence written to the client.'),
  sourceEventIds: z
    .array(z.string())
    .describe('Ids of the activity events this item draws from. Use only ids that were provided.'),
});

export const reportSectionSchema = z.object({
  kind: z.enum(reportSectionKinds),
  items: z.array(reportItemSchema),
});

export const statusReportDraftSchema = z.object({
  headline: z.string().describe('One sentence, the most important outcome of the week.'),
  greeting: z.string().describe('A short opening line addressed to the client.'),
  sections: z.array(reportSectionSchema),
  signoff: z.string().describe('A brief closing line.'),
});

export type ReportItem = z.infer<typeof reportItemSchema>;
export type ReportSection = z.infer<typeof reportSectionSchema>;
export type StatusReportDraft = z.infer<typeof statusReportDraftSchema>;

/** The agency voice settings captured in onboarding. */
export interface ReportVoice {
  tone: Tone;
  length: Length;
  signoff: string;
  voiceSample: string;
}

export interface ReportPeriod {
  since: Date;
  until: Date;
}

/**
 * The outcome of a generation attempt. `insufficient` means the week was too
 * quiet to draft honestly, the PM is offered skip-or-write-from-scratch.
 */
export type NarrativeResult =
  | {
      status: 'drafted';
      draft: StatusReportDraft;
      periodLabel: string;
      eventsUsed: number;
      warnings: string[];
    }
  | {
      status: 'insufficient';
      reason: string;
      periodLabel: string;
      eventsUsed: number;
      warnings: string[];
    };
