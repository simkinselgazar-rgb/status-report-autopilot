import { z } from 'zod';

import { getSession, unauthorized } from '@/lib/auth/session';
import { sourceConnectionSchema } from '@/lib/connectors/connection';
import { badRequest } from '@/lib/connectors/http';
import { sourceEventSchema } from '@/lib/connectors/types';
import { createClientWithReport } from '@/lib/db/queries';
import { statusReportDraftSchema } from '@/lib/reports/types';

export const runtime = 'nodejs';

/** The onboarding wizard's commit payload, a client plus its first report. */
const bodySchema = z.object({
  name: z.string().min(1, 'A client name is required.'),
  recipient: z.string().email('A valid client email is required.'),
  voice: z.object({
    tone: z.enum(['buttoned', 'professional', 'warm']),
    length: z.enum(['headlines', 'balanced', 'thorough']),
    signoff: z.string(),
    voiceSample: z.string(),
  }),
  cadence: z.object({
    day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri']),
    time: z.enum(['7am', '9am', '12pm', '3pm']),
    timezone: z.string().min(1, 'A timezone is required.'),
  }),
  connections: z
    .array(sourceConnectionSchema)
    .min(1, 'At least one connected source is required.'),
  report: z.object({
    periodStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'A reporting-period start date is required.'),
    periodLabel: z.string().min(1, 'A reporting-period label is required.'),
    eventsUsed: z.number().int().nonnegative(),
    draft: statusReportDraftSchema,
    sourceEvents: z.array(sourceEventSchema),
  }),
});

/**
 * POST /api/clients
 *
 * Persists an onboarded client and its first generated report. The dashboard
 * (`/`) reads them on its next request.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await getSession())) return unauthorized();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest('Expected a JSON request body.');
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Invalid request.');
  }

  const { name, recipient, voice, cadence, connections, report } = parsed.data;

  try {
    const clientId = await createClientWithReport({
      client: {
        name,
        recipient,
        voiceTone: voice.tone,
        voiceLength: voice.length,
        voiceSignoff: voice.signoff,
        voiceSample: voice.voiceSample,
        cadenceDay: cadence.day,
        cadenceTime: cadence.time,
        timezone: cadence.timezone,
        connections,
      },
      report,
    });
    return Response.json({ ok: true, clientId }, { status: 201 });
  } catch {
    return Response.json(
      {
        ok: false,
        error: { code: 'create_failed', message: "We couldn't save the client. Try again." },
      },
      { status: 502 },
    );
  }
}
