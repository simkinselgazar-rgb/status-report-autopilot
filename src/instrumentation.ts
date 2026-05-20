/**
 * Next.js instrumentation, runs once at server boot.
 *
 * Kicks off the in-app recurring-report scheduler. In dev the scheduler is off
 * by default (a `next dev` restart shouldn't fire connector pulls + LLM calls);
 * set `SCHEDULER_ENABLED=true` to opt in. Production runs it unconditionally.
 */

export async function register(): Promise<void> {
  // Skip on the edge runtime, the scheduler is a Node-only timer.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const enabled =
    process.env.NODE_ENV === 'production' || process.env.SCHEDULER_ENABLED === 'true';
  if (!enabled) return;

  // Dynamic import keeps the scheduler module out of the edge bundle.
  const { startScheduler } = await import('@/lib/reports/scheduler');
  startScheduler();
}
