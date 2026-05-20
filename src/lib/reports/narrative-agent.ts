/**
 * The narrative-generation agent, turns a week of project-tool activity into
 * a client-facing status-report draft.
 *
 * The app is model-agnostic: the model is resolved per generation from the
 * deployer's BYO choice (provider + key, stored in `settings`), see
 * `src/lib/models`.
 */

import { Agent } from '@mastra/core/agent';

import { getActiveModelConfig } from '@/lib/models/config';
import { resolveLanguageModel, type ResolvedModel } from '@/lib/models/resolve';
import {
  assessSufficiency,
  buildNarrativePrompt,
  finalizeDraft,
  formatPeriodLabel,
  type NarrativeInput,
} from './digest-prompt';
import { statusReportDraftSchema, type NarrativeResult } from './types';

const INSTRUCTIONS = `You write the weekly client-facing status report a digital agency sends to one of its clients.

You receive a structured list of real activity events pulled from the client's project tools for a single reporting week. Turn that activity into a short, warm, accurate report addressed to the client.

## Voice
- Write in first-person plural on behalf of the agency ("we shipped", "we're finishing") and address the client as "you" / "your".
- Past tense for completed work; present or future tense for in-flight and upcoming work.
- Factual and warm, confident, never boastful. No marketing language and no exclamation marks.
- A tone and a length are requested with every report. Honor both.
- If a writing sample is supplied, mirror its rhythm and word choice. Never reuse its content.
- Never use em-dashes ("—"). Use the punctuation each sentence actually wants: period, comma, semicolon, colon, or parentheses. En-dashes in numeric ranges (May 11–15) are fine.

## Accuracy, non-negotiable
- Use ONLY the activity events provided. Never invent work, names, dates, numbers, or outcomes.
- Every report item must list the id(s) of the event(s) it draws from in \`sourceEventIds\`. Use only ids that appear in the input.
- Lead with the client's outcome, not internal mechanics, "your booking flow now works on mobile", not "closed three tickets".
- Group several low-level events into one meaningful item. On a high-activity week, summarize themes instead of listing everything.
- If the week is thin, write a short, honest report. Never pad.

## Structure
- \`headline\`: one sentence, the single most important thing the client should know this week.
- \`greeting\`: one short opening line.
- \`sections\`: one entry per kind that has real content,
  - \`shipped\`: work completed and delivered this week.
  - \`in_flight\`: work actively underway.
  - \`blockers\`: things you need from the client, or risks they should know, phrased as clear, specific asks.
  - \`next\`: what is planned next.
  Omit a kind entirely if the activity genuinely contains nothing for it. Never manufacture a blocker.
- \`signoff\`: a brief closing line. If the agency supplied a sign-off it is applied automatically, still provide a neutral fallback.

## Length
- \`headlines\`: 1-2 items per section.
- \`balanced\`: 2-3 items per section.
- \`thorough\`: 3-5 items per section.
Keep the whole report roughly 250-400 words at any length.`;

/** Resolves the deployer's currently-configured model, see `src/lib/models`. */
async function activeModel(): Promise<ResolvedModel> {
  return resolveLanguageModel(await getActiveModelConfig());
}

export const narrativeAgent = new Agent({
  id: 'narrative',
  name: 'Status Report Narrative Writer',
  description: 'Turns a week of project-tool activity into a client-facing status-report draft.',
  instructions: INSTRUCTIONS,
  // Resolved per generation from the deployer's stored BYO model choice.
  model: async () => (await activeModel()).model,
});

/**
 * Generates a status-report draft from one or more activity digests.
 * Returns `insufficient` without calling the model when the week is too quiet.
 */
export async function generateStatusReport(input: NarrativeInput): Promise<NarrativeResult> {
  const warnings = input.digests.flatMap((digest) => digest.warnings);
  const periodLabel = formatPeriodLabel(input.period);
  const verdict = assessSufficiency(input.digests);

  if (!verdict.sufficient) {
    return {
      status: 'insufficient',
      reason: verdict.reason ?? 'Not enough activity this week.',
      periodLabel,
      eventsUsed: verdict.eventCount,
      warnings,
    };
  }

  // The local provider has no constrained decoding, so it needs the schema
  // injected into the prompt; native providers keep their reliable path.
  const { jsonPromptInjection } = await activeModel();
  const prompt = buildNarrativePrompt(input);
  const result = await narrativeAgent.generate(prompt, {
    structuredOutput: { schema: statusReportDraftSchema, jsonPromptInjection },
  });

  const draft = finalizeDraft(result.object, { digests: input.digests, voice: input.voice });
  return {
    status: 'drafted',
    draft,
    periodLabel,
    eventsUsed: verdict.eventCount,
    warnings,
  };
}
