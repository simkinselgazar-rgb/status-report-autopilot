/**
 * In-app scheduler, the OSS deployment's replacement for Vercel Cron.
 *
 * On server boot the instrumentation hook calls {@link startScheduler}, which
 * fires {@link runDueReports} once immediately and then on an hourly interval,
 * the same cadence the Vercel `vercel.json` cron used. Per-client timezone
 * cadence is decided inside `runDueReports`, so a global hourly tick is fine.
 *
 * Single instance, a `globalThis` flag stops Next.js dev HMR from stacking
 * intervals across reloads.
 */

import { runDueReports } from './recurring';

const ONE_HOUR_MS = 60 * 60 * 1000;
const SCHEDULER_KEY = Symbol.for('@sra/scheduler');

type GlobalWithScheduler = typeof globalThis & {
  [SCHEDULER_KEY]?: NodeJS.Timeout;
};

export function startScheduler(): void {
  const slot = globalThis as GlobalWithScheduler;
  if (slot[SCHEDULER_KEY]) return;
  console.log('[scheduler] starting, hourly recurring report generation');
  // Fire once at boot, then on the interval.
  void runSafe();
  slot[SCHEDULER_KEY] = setInterval(() => {
    void runSafe();
  }, ONE_HOUR_MS);
}

async function runSafe(): Promise<void> {
  try {
    const summary = await runDueReports();
    console.log('[scheduler] run complete', summary);
  } catch (error) {
    console.error('[scheduler] run failed:', error);
  }
}
