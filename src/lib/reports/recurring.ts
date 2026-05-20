/**
 * Recurring report generation, the product's weekly heartbeat.
 *
 * `runDueReports` is invoked by the cron route. For every client whose cadence
 * slot has arrived and who has no report yet for the covered week, it pulls
 * each source's activity for the prior Mon–Fri week, runs the narrative agent,
 * and persists the draft into the dashboard queue. Per-client failures are
 * isolated, one bad client never aborts the run.
 */

import { createConnectorForConnection } from '@/lib/connectors/connection';
import type { ActivityDigest } from '@/lib/connectors/types';
import { createReport, listClients, reportExistsForPeriod } from '@/lib/db/queries';
import type { ClientRow } from '@/lib/db/schema';
import type { TimeSlot, Weekday } from '@/lib/onboarding/types';
import { generateStatusReport } from '@/lib/reports/narrative-agent';
import { cadenceMoment, previousReportWeek } from '@/lib/reports/period';

/** Cadence weekday → Monday-based index (Mon = 0 … Fri = 4). */
const CADENCE_DAY_INDEX: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 };
/** Cadence slot → 24-hour local hour. */
const CADENCE_HOUR: Record<TimeSlot, number> = { '7am': 7, '9am': 9, '12pm': 12, '3pm': 15 };

type CadenceFields = Pick<ClientRow, 'timezone' | 'cadenceDay' | 'cadenceTime'>;

/**
 * True once the client's cadence slot for the current calendar week has
 * arrived. It stays true for the rest of the week, the "already generated"
 * check is what stops a second report, which also self-heals a missed cron run.
 */
export function isDue(client: CadenceFields, now: Date): boolean {
  const moment = cadenceMoment(
    now,
    client.timezone,
    CADENCE_DAY_INDEX[client.cadenceDay],
    CADENCE_HOUR[client.cadenceTime],
  );
  return now.getTime() >= moment.getTime();
}

/** Pull activity, generate, and persist one client's report. */
async function generateAndPersistForClient(
  client: ClientRow,
  now: Date,
): Promise<'drafted' | 'insufficient'> {
  const week = previousReportWeek(now, client.timezone);

  // Pull the reporting window's activity from every connected source. Token
  // connectors hold long-lived credentials and Zoom mints its own, so there
  // is nothing to refresh.
  const digests: ActivityDigest[] = [];
  for (const connection of client.connections) {
    const connector = createConnectorForConnection(connection);
    digests.push(await connector.fetchActivity({ since: week.since, until: week.until }));
  }

  const result = await generateStatusReport({
    client: { name: client.name },
    period: { since: week.since, until: week.until },
    digests,
    voice: {
      tone: client.voiceTone,
      length: client.voiceLength,
      signoff: client.voiceSignoff,
      voiceSample: client.voiceSample,
    },
  });

  await createReport({
    clientId: client.id,
    periodStart: week.periodStart,
    result,
    sourceEvents: digests.flatMap((digest) => digest.events),
  });
  return result.status;
}

export interface RecurringSummary {
  /** Clients inspected. */
  checked: number;
  /** Clients whose cadence slot had arrived. */
  due: number;
  /** Reports drafted this run. */
  generated: number;
  /** Due clients whose week was too quiet, persisted as `insufficient`. */
  insufficient: number;
  /** Due clients already reported on for the week. */
  skipped: number;
  /** Due clients whose generation threw. */
  failed: number;
  failures: { clientId: string; error: string }[];
}

/** Injectable seams, real implementations by default, fakes in tests. */
export interface RecurringDeps {
  listClients: () => Promise<ClientRow[]>;
  reportExists: (clientId: string, periodStart: string) => Promise<boolean>;
  generateForClient: (client: ClientRow, now: Date) => Promise<'drafted' | 'insufficient'>;
}

const defaultDeps: RecurringDeps = {
  listClients,
  reportExists: reportExistsForPeriod,
  generateForClient: generateAndPersistForClient,
};

/**
 * Generate the week's reports for every due client. Idempotent: a client
 * already reported on for the week is skipped, and the report insert itself
 * is conflict-safe, so a duplicate cron fire produces nothing.
 */
export async function runDueReports(
  now: Date = new Date(),
  deps: RecurringDeps = defaultDeps,
): Promise<RecurringSummary> {
  const clients = await deps.listClients();
  const summary: RecurringSummary = {
    checked: clients.length,
    due: 0,
    generated: 0,
    insufficient: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  for (const client of clients) {
    try {
      if (!isDue(client, now)) continue;
      summary.due += 1;

      const { periodStart } = previousReportWeek(now, client.timezone);
      if (await deps.reportExists(client.id, periodStart)) {
        summary.skipped += 1;
        continue;
      }

      const status = await deps.generateForClient(client, now);
      if (status === 'drafted') summary.generated += 1;
      else summary.insufficient += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        clientId: client.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
