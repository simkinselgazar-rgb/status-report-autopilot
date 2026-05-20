import { env } from '@/lib/env';
import { runDueReports } from '@/lib/reports/recurring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * A run touches every due client sequentially, connector fetches plus an LLM
 * call each. 5 minutes covers a typical roster; past ~10 clients this wants
 * fan-out (see the ROADMAP, v1.1).
 */
export const maxDuration = 300;

/**
 * GET /api/cron/generate-reports
 *
 * The recurring-generation entry point. Vercel Cron calls it hourly with the
 * `CRON_SECRET` as a bearer token; the route is scheduler-agnostic, so any
 * scheduler that sends that header works. Fails closed, without a configured
 * secret the route refuses to run rather than expose generation publicly.
 */
export async function GET(request: Request): Promise<Response> {
  if (!env.cronSecret) {
    return Response.json(
      { ok: false, error: 'CRON_SECRET is not configured.' },
      { status: 503 },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${env.cronSecret}`) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const summary = await runDueReports();
    return Response.json({ ok: true, summary });
  } catch (error) {
    console.error('Recurring report run failed', error);
    return Response.json({ ok: false, error: 'The report run failed.' }, { status: 500 });
  }
}
