/**
 * Product database schema (Drizzle / Postgres).
 *
 * `clients` is the agency's roster, identity, the client-facing recipient, the
 * captured agency voice, the report cadence, and the connected Asana source.
 * `reports` is one generated status report per client per reporting week; the
 * narrative lives in `draft` and PM inline-edits update it in place.
 *
 * Mastra's own agent-state tables live in the same database under their own
 * names, these two tables are the product layer.
 */

import {
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { SourceEvent } from '@/lib/connectors/types';
import type { ReportStatus } from '@/lib/dashboard/types';
import type { Length, SourceConnection, TimeSlot, Tone, Weekday } from '@/lib/onboarding/types';
import type { StatusReportDraft } from '@/lib/reports/types';

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The client's display name. */
  name: text('name').notNull(),
  /** Client-facing recipient an approved report sends to. */
  recipient: text('recipient').notNull(),
  /** Agency voice, captured in onboarding. */
  voiceTone: text('voice_tone').$type<Tone>().notNull(),
  voiceLength: text('voice_length').$type<Length>().notNull(),
  voiceSignoff: text('voice_signoff').notNull().default(''),
  voiceSample: text('voice_sample').notNull().default(''),
  /** Weekly send cadence. */
  cadenceDay: text('cadence_day').$type<Weekday>().notNull(),
  cadenceTime: text('cadence_time').$type<TimeSlot>().notNull(),
  /** IANA timezone the cadence day/time are interpreted in. */
  timezone: text('timezone').notNull().default('America/New_York'),
  /** Connected sources (Asana / Linear / …), empty until the client connects one. */
  connections: jsonb('connections').$type<SourceConnection[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  /** Capability token for the public shareable link, distinct from `id`. */
  shareToken: uuid('share_token').notNull().unique().defaultRandom(),
  /** Monday (`YYYY-MM-DD`) of the Mon–Fri week this report covers, the period key. */
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  periodLabel: text('period_label').notNull(),
  status: text('status').$type<ReportStatus>().notNull(),
  /** ISO, when the agent produced this draft. */
  generatedAt: timestamp('generated_at', { withTimezone: true, mode: 'string' }).notNull(),
  eventsUsed: integer('events_used').notNull(),
  /** The narrative; `null` when the week was too quiet to draft. */
  draft: jsonb('draft').$type<StatusReportDraft>(),
  /** Why the week was insufficient; `null` otherwise. */
  insufficientReason: text('insufficient_reason'),
  /** The activity the agent read, powers the provenance drawer. */
  sourceEvents: jsonb('source_events').$type<SourceEvent[]>().notNull(),
  /** ISO, when the report was approved & sent; `null` until then. */
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // One report per client per reporting week, makes recurring generation idempotent.
  uniqueIndex('reports_client_period_uq').on(table.clientId, table.periodStart),
]);

/**
 * App-level settings, a single row keyed `'app'`. Holds the deployer's chosen
 * BYO model (provider, model id, API key, optional endpoint). Single-deployment,
 * so one row is the whole table.
 */
export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  /** Model provider id, `null` until a model is configured. */
  modelProvider: text('model_provider'),
  modelId: text('model_id'),
  /** The deployer's own API key, stored in their own database. */
  modelApiKey: text('model_api_key'),
  /** Endpoint URL, used only by a local model. */
  modelBaseUrl: text('model_base_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ClientRow = typeof clients.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type NewClientRow = typeof clients.$inferInsert;
export type NewReportRow = typeof reports.$inferInsert;
export type SettingsRow = typeof settings.$inferSelect;
