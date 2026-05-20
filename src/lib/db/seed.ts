/**
 * Dev seed, loads the demo roster into the product DB.
 *
 * Run with `npm run db:seed`. Wipes the clients/reports tables, then re-inserts
 * the five demo clients/reports, so the dashboard has data without anyone
 * onboarding. Sign-in is separate: create an account on /sign-in.
 *
 * Self-contained on purpose: it opens its own pool and uses relative imports
 * only, so `tsx` runs it as a plain script with no path-alias resolution.
 */

import 'dotenv/config';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { SEED_REPORTS } from '../dashboard/seed';
import { previousReportWeek } from '../reports/period';
import { clients, reports } from './schema';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required, see .env.example');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema: { clients, reports } });

  // FK-safe order: reports reference clients.
  await db.delete(reports);
  await db.delete(clients);

  for (const report of SEED_REPORTS) {
    const [client] = await db
      .insert(clients)
      .values({
        name: report.clientName,
        recipient: report.recipient,
        voiceTone: 'professional',
        voiceLength: 'balanced',
        voiceSignoff: report.draft?.signoff ?? '',
        voiceSample: '',
        cadenceDay: 'fri',
        cadenceTime: '9am',
      })
      .returning();

    await db.insert(reports).values({
      clientId: client!.id,
      periodStart: previousReportWeek(new Date(report.generatedAt), 'America/New_York').periodStart,
      periodLabel: report.periodLabel,
      status: report.status,
      generatedAt: report.generatedAt,
      eventsUsed: report.eventsUsed,
      draft: report.draft,
      insufficientReason: report.insufficientReason,
      sourceEvents: report.sourceEvents,
      sentAt: report.sentAt,
    });
  }

  await pool.end();
  console.log(`Seeded ${SEED_REPORTS.length} clients + reports.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
