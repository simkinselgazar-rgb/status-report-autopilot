/**
 * Pure logic around the narrative agent: the sufficiency gate, prompt
 * assembly, and post-generation guards. No LLM, no I/O, all testable.
 */

import type { ActivityDigest, SourceEvent } from '@/lib/connectors/types';
import {
  reportSectionKinds,
  type ReportItem,
  type ReportPeriod,
  type ReportSectionKind,
  type ReportVoice,
  type StatusReportDraft,
} from './types';

/** Below this many events a week is too quiet to draft honestly. */
const MIN_EVENTS = 3;

const TONE_GLOSS: Record<ReportVoice['tone'], string> = {
  buttoned: 'formal and precise',
  professional: 'clear and neutral',
  warm: 'friendly and human',
};

export interface NarrativeInput {
  client: { name: string };
  period: ReportPeriod;
  digests: ActivityDigest[];
  voice: ReportVoice;
}

export interface SufficiencyVerdict {
  sufficient: boolean;
  eventCount: number;
  /** PM-facing explanation when the week is too quiet; `null` when sufficient. */
  reason: string | null;
}

/** Decides whether there is enough activity to draft a report at all. */
export function assessSufficiency(digests: readonly ActivityDigest[]): SufficiencyVerdict {
  const eventCount = digests.reduce((sum, digest) => sum + digest.events.length, 0);
  if (eventCount === 0) {
    return {
      sufficient: false,
      eventCount,
      reason: 'No activity was found in the connected tools this week.',
    };
  }
  if (eventCount < MIN_EVENTS) {
    const noun = eventCount === 1 ? 'update' : 'updates';
    return {
      sufficient: false,
      eventCount,
      reason: `Only ${eventCount} ${noun} this week, too quiet for a full report.`,
    };
  }
  return { sufficient: true, eventCount, reason: null };
}

/** A human reporting-period label, e.g. "Week of May 11–15". */
export function formatPeriodLabel(period: ReportPeriod): string {
  const month = period.since.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const sameMonth = period.since.getUTCMonth() === period.until.getUTCMonth();
  const tail = sameMonth
    ? `${period.until.getUTCDate()}`
    : `${period.until.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })} ${period.until.getUTCDate()}`;
  return `Week of ${month} ${period.since.getUTCDate()}–${tail}`;
}

/** Assembles the user-message prompt fed to the narrative agent. */
export function buildNarrativePrompt(input: NarrativeInput): string {
  const events = collectEvents(input.digests);
  const warnings = input.digests.flatMap((digest) => digest.warnings);
  const lines: string[] = [
    `Reporting client: ${input.client.name}`,
    `Reporting period: ${formatPeriodLabel(input.period)}`,
    '',
    `Requested tone: ${input.voice.tone}, ${TONE_GLOSS[input.voice.tone]}`,
    `Requested length: ${input.voice.length}`,
  ];

  const sample = input.voice.voiceSample.trim();
  if (sample) {
    lines.push('', 'Agency writing sample, mirror its style, not its content:', `"${sample}"`);
  }
  if (warnings.length > 0) {
    lines.push('', `Data notes: ${warnings.join('; ')}`);
  }

  lines.push('', `Activity events (${events.length} total):`, '');
  for (const event of events) {
    lines.push(renderEvent(event));
  }
  lines.push('', 'Write the report now.');
  return lines.join('\n');
}

/**
 * Post-generation guards: canonical section order, duplicate-kind merge,
 * empty-section drop, provenance-id filtering, and the agency sign-off override.
 */
export function finalizeDraft(
  raw: StatusReportDraft,
  input: { digests: readonly ActivityDigest[]; voice: ReportVoice },
): StatusReportDraft {
  const validIds = new Set(
    input.digests.flatMap((digest) => digest.events.map((event) => event.id)),
  );

  const itemsByKind = new Map<ReportSectionKind, ReportItem[]>();
  for (const section of raw.sections) {
    const cleaned = section.items.map((item) => ({
      text: item.text.trim(),
      sourceEventIds: item.sourceEventIds.filter((id) => validIds.has(id)),
    }));
    itemsByKind.set(section.kind, (itemsByKind.get(section.kind) ?? []).concat(cleaned));
  }

  const sections = reportSectionKinds
    .map((kind) => ({ kind, items: itemsByKind.get(kind) ?? [] }))
    .filter((section) => section.items.length > 0);

  return {
    headline: raw.headline.trim(),
    greeting: raw.greeting.trim(),
    sections,
    signoff: input.voice.signoff.trim() || raw.signoff.trim(),
  };
}

function collectEvents(digests: readonly ActivityDigest[]): SourceEvent[] {
  return digests
    .flatMap((digest) => digest.events)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function renderEvent(event: SourceEvent): string {
  const date = event.timestamp.slice(0, 10);
  const actor = event.actor ? ` · ${event.actor}` : '';
  let block = `[${event.id}] ${event.kind} · ${date}${actor}\n  ${event.title}`;
  if (event.detail) {
    block += `\n  ${event.detail.replace(/\s+/g, ' ').trim()}`;
  }
  return block;
}
