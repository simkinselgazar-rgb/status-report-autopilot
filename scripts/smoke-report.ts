/**
 * End-to-end report smoke test.
 *
 * Pulls a digest from each configured connector for the past 7 days, runs the
 * narrative agent against the local model from env, and prints the structured
 * status-report draft to stdout.
 *
 * Bypasses the database (no `settings` row, no `clients`/`reports` rows). The
 * connector + narrative-agent + LLM path is exactly what /api/reports/generate
 * runs in production, the only thing skipped is persistence.
 *
 * Requires LOCAL_MODEL_URL + LOCAL_MODEL_NAME in .env (or any other supported
 * provider env vars, e.g. GOOGLE_GENERATIVE_AI_API_KEY), plus the connector
 * tokens used by smoke-connector.ts.
 *
 * Usage:
 *
 *   npm exec tsx scripts/smoke-report.ts
 *
 * Default: runs every source whose credentials are in .env. Use
 *
 *   npm exec tsx scripts/smoke-report.ts -- --sources=asana,linear
 *
 * to limit to a subset.
 */

import 'dotenv/config';

import { Agent } from '@mastra/core/agent';

import { createAsanaConnector } from '../src/lib/connectors/asana';
import { createLinearConnector } from '../src/lib/connectors/linear';
import { createSlackConnector } from '../src/lib/connectors/slack';
import { createTeamsConnector, splitTeamsTarget } from '../src/lib/connectors/teams';
import { createZoomConnector } from '../src/lib/connectors/zoom';
import type { ActivityDigest, Connector } from '../src/lib/connectors/types';
import {
  assessSufficiency,
  buildNarrativePrompt,
  finalizeDraft,
  formatPeriodLabel,
} from '../src/lib/reports/digest-prompt';
import { resolveLanguageModel } from '../src/lib/models/resolve';
import type { ModelConfig } from '../src/lib/models/providers';
import {
  reportSectionKinds,
  statusReportDraftSchema,
  type ReportSectionKind,
  type ReportVoice,
} from '../src/lib/reports/types';

// --- The test fixture --------------------------------------------------------

/**
 * The target IDs are read from env so this script is workspace-agnostic.
 * Discover each id by running `scripts/smoke-connector.ts` for the source
 * with `--workspace=<id>`, copy the printed `--project=<id>` value into the
 * matching env var below, then re-run this script. A missing env var skips
 * that source (the script runs against the remaining sources).
 *
 *   SRA_SMOKE_ASANA_PROJECT_GID  Asana project gid (numeric).
 *   SRA_SMOKE_LINEAR_PROJECT_ID  Linear project id (uuid).
 *   SRA_SMOKE_SLACK_CHANNEL_ID   Slack channel id (e.g. C0123ABC456).
 *   SRA_SMOKE_ZOOM_USER_ID       Zoom user id.
 *   SRA_SMOKE_TEAMS_TARGET       Teams `teamId|channelId` composite.
 */
const TARGETS = {
  asana: process.env.SRA_SMOKE_ASANA_PROJECT_GID?.trim(),
  linear: process.env.SRA_SMOKE_LINEAR_PROJECT_ID?.trim(),
  slack: process.env.SRA_SMOKE_SLACK_CHANNEL_ID?.trim(),
  zoom: process.env.SRA_SMOKE_ZOOM_USER_ID?.trim(),
  teams: process.env.SRA_SMOKE_TEAMS_TARGET?.trim(),
} as const;

const CLIENT = { name: process.env.SRA_SMOKE_CLIENT_NAME?.trim() || 'Acme Studio' };

const VOICE: ReportVoice = {
  tone: 'professional',
  length: 'balanced',
  signoff: 'Best from the team,\nThe Agency',
  voiceSample: '',
};

type SourceId = keyof typeof TARGETS;

// --- helpers -----------------------------------------------------------------

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseSources(): SourceId[] {
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--sources=')) continue;
    const value = raw.slice('--sources='.length).trim();
    if (!value) continue;
    return value.split(',').map((s) => s.trim()) as SourceId[];
  }
  return Object.keys(TARGETS) as SourceId[];
}

/**
 * Build the model config from env, mirroring `modelConfigFromEnv()` in
 * src/lib/models/config.ts but without touching the database.
 */
function modelConfigFromEnv(): ModelConfig {
  const localUrl = process.env.LOCAL_MODEL_URL?.trim();
  if (localUrl) {
    return {
      provider: 'local',
      modelId: process.env.LOCAL_MODEL_NAME?.trim() ?? '',
      apiKey: '',
      baseUrl: localUrl,
    };
  }
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (googleKey) {
    return { provider: 'google', modelId: '', apiKey: googleKey, baseUrl: '' };
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return { provider: 'anthropic', modelId: '', apiKey: anthropicKey, baseUrl: '' };
  }
  fail('No model env config found. Set LOCAL_MODEL_URL (+ LOCAL_MODEL_NAME) or another supported provider key.');
}

interface BuildResult {
  connector: Connector | null;
  /** Reason the connector wasn't built, when `connector` is `null`. */
  reason?: string;
}

function buildConnector(source: SourceId): BuildResult {
  const target = TARGETS[source];
  switch (source) {
    case 'asana': {
      const token = process.env.ASANA_TOKEN?.trim();
      if (!token) return { connector: null, reason: 'ASANA_TOKEN unset' };
      if (!target) return { connector: null, reason: 'SRA_SMOKE_ASANA_PROJECT_GID unset' };
      return {
        connector: createAsanaConnector({ accessToken: token, projectGids: [target] }),
      };
    }
    case 'linear': {
      const token = process.env.LINEAR_TOKEN?.trim();
      if (!token) return { connector: null, reason: 'LINEAR_TOKEN unset' };
      if (!target) return { connector: null, reason: 'SRA_SMOKE_LINEAR_PROJECT_ID unset' };
      return {
        connector: createLinearConnector({ accessToken: token, projectIds: [target] }),
      };
    }
    case 'slack': {
      const token = process.env.SLACK_TOKEN?.trim();
      if (!token) return { connector: null, reason: 'SLACK_TOKEN unset' };
      if (!target) return { connector: null, reason: 'SRA_SMOKE_SLACK_CHANNEL_ID unset' };
      return {
        connector: createSlackConnector({ accessToken: token, channelIds: [target] }),
      };
    }
    case 'zoom': {
      const accountId = process.env.ZOOM_ACCOUNT_ID?.trim();
      const clientId = process.env.ZOOM_CLIENT_ID?.trim();
      const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim();
      if (!accountId || !clientId || !clientSecret) {
        return { connector: null, reason: 'ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET unset' };
      }
      if (!target) return { connector: null, reason: 'SRA_SMOKE_ZOOM_USER_ID unset' };
      return {
        connector: createZoomConnector({ accountId, clientId, clientSecret, userIds: [target] }),
      };
    }
    case 'teams': {
      const tenantId = process.env.TEAMS_TENANT_ID?.trim();
      const clientId = process.env.TEAMS_CLIENT_ID?.trim();
      const clientSecret = process.env.TEAMS_CLIENT_SECRET?.trim();
      if (!tenantId || !clientId || !clientSecret) {
        return { connector: null, reason: 'TEAMS_TENANT_ID / TEAMS_CLIENT_ID / TEAMS_CLIENT_SECRET unset' };
      }
      if (!target) return { connector: null, reason: 'SRA_SMOKE_TEAMS_TARGET unset' };
      return {
        connector: createTeamsConnector({
          tenantId,
          clientId,
          clientSecret,
          targets: [splitTeamsTarget(target)],
        }),
      };
    }
  }
}

function logDigest(source: SourceId, digest: ActivityDigest, ms: number): void {
  console.log(
    `  ${source.padEnd(7)} ${digest.stats.eventsFound.toString().padStart(3)} events  (${digest.stats.itemsScanned} scanned, ${ms}ms)`,
  );
  if (digest.warnings.length > 0) {
    for (const warning of digest.warnings) console.log(`            ! ${warning}`);
  }
}

const SECTION_LABELS: Record<ReportSectionKind, string> = {
  shipped: 'Shipped',
  in_flight: 'In flight',
  blockers: 'Blockers',
  next: 'Next',
};

function printDraftSections(sections: { kind: ReportSectionKind; items: { text: string; sourceEventIds: string[] }[] }[]): void {
  // Render in canonical order even if the agent emitted them out of order.
  const byKind = new Map(sections.map((s) => [s.kind, s] as const));
  for (const kind of reportSectionKinds) {
    const section = byKind.get(kind);
    if (!section || section.items.length === 0) continue;
    console.log(`\n## ${SECTION_LABELS[kind]}`);
    for (const item of section.items) {
      console.log(`  - ${item.text}`);
      if (item.sourceEventIds.length > 0) {
        console.log(`      [${item.sourceEventIds.length} source event${item.sourceEventIds.length === 1 ? '' : 's'}]`);
      }
    }
  }
}

// --- main --------------------------------------------------------------------

async function main(): Promise<void> {
  const sources = parseSources();
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const period = { since, until: now };

  console.log(`\n— smoke-report —`);
  console.log(`Window: ${since.toISOString()} → ${now.toISOString()}`);
  console.log(`Sources: ${sources.join(', ')}`);

  // 1. Resolve the model.
  const modelConfig = modelConfigFromEnv();
  console.log(`Model: ${modelConfig.provider}${modelConfig.modelId ? ` (${modelConfig.modelId})` : ''}`);
  if (modelConfig.baseUrl) console.log(`Endpoint: ${modelConfig.baseUrl}`);

  // 2. Pull a digest per source, in parallel for speed.
  console.log(`\nfetching activity:`);
  const digestStart = Date.now();
  const results = await Promise.all(
    sources.map(async (source) => {
      const built = buildConnector(source);
      if (!built.connector) {
        console.log(`  ${source.padEnd(7)} skipped (${built.reason})`);
        return null;
      }
      const start = Date.now();
      try {
        const digest = await built.connector.fetchActivity(period);
        logDigest(source, digest, Date.now() - start);
        return digest;
      } catch (error) {
        console.log(`  ${source.padEnd(7)} FAILED  (${Date.now() - start}ms)`);
        console.log(`            ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    }),
  );
  const digests = results.filter((d): d is ActivityDigest => d !== null);
  console.log(`  total: ${digests.reduce((n, d) => n + d.events.length, 0)} events from ${digests.length} source(s) in ${Date.now() - digestStart}ms`);

  if (digests.length === 0) {
    fail('No digests collected. Check that connector credentials are in .env.');
  }

  // 3. Sufficiency gate, exactly like generateStatusReport does.
  const verdict = assessSufficiency(digests);
  if (!verdict.sufficient) {
    console.log(`\nverdict: insufficient (${verdict.reason ?? 'no reason given'})`);
    console.log(`This is the right path when a week has no real activity. The narrative agent is not called.`);
    process.exit(0);
  }
  console.log(`\nverdict: sufficient (${verdict.eventCount} events)`);

  // 4. Resolve the model + build a one-shot agent.
  const resolved = resolveLanguageModel(modelConfig);
  const agent = new Agent({
    id: 'smoke-narrative',
    name: 'Smoke Narrative Writer',
    description: 'Smoke-test variant of the narrative agent.',
    instructions:
      'You write the weekly client-facing status report a digital agency sends to one of its clients. Past tense for shipped work; present or future for in-flight and next; concise, factual, warm. Use ONLY the events provided. Never invent. Each item must list the sourceEventIds it draws from. Never use em-dashes.',
    model: resolved.model,
  });

  // 5. Call the model.
  console.log(`\ngenerating draft...`);
  const generateStart = Date.now();
  const input = { client: CLIENT, period, digests, voice: VOICE };
  const prompt = buildNarrativePrompt(input);
  const result = await agent.generate(prompt, {
    structuredOutput: {
      schema: statusReportDraftSchema,
      jsonPromptInjection: resolved.jsonPromptInjection,
    },
  });
  console.log(`  done in ${Math.round((Date.now() - generateStart) / 100) / 10}s`);

  // Optional raw dump for debugging the model output before finalize.
  if (process.argv.includes('--debug')) {
    console.log('\n========== raw model output ==========');
    console.log(JSON.stringify(result.object, null, 2));
    console.log('========== ./raw ==========');
  }

  // 6. Finalize + print.
  const draft = finalizeDraft(result.object, { digests, voice: VOICE });
  console.log('\n========== draft ==========');
  console.log(`Period: ${formatPeriodLabel(period)}`);
  console.log(`\n${draft.headline}`);
  console.log(`\n${draft.greeting}`);
  printDraftSections(draft.sections);
  console.log(`\n${draft.signoff}`);
  console.log('\n========== ./draft ==========');
}

main().catch((error) => {
  console.error(`\nfailed: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exit(1);
});
