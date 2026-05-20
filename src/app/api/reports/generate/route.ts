import { z } from 'zod';

import { getSession, unauthorized } from '@/lib/auth/session';
import { createConnectorForConnection, sourceConnectionSchema } from '@/lib/connectors/connection';
import { badRequest, connectorErrorResponse } from '@/lib/connectors/http';
import { ConnectorError } from '@/lib/connectors/types';
import { generateStatusReport } from '@/lib/reports/narrative-agent';

export const runtime = 'nodejs';

const bodySchema = z.object({
  client: z.object({ name: z.string().min(1, 'A client name is required.') }),
  period: z.object({
    since: z.string().min(1, 'A reporting-period start is required.'),
    until: z.string().min(1, 'A reporting-period end is required.'),
  }),
  connections: z
    .array(sourceConnectionSchema)
    .min(1, 'At least one connected source is required.'),
  voice: z.object({
    tone: z.enum(['buttoned', 'professional', 'warm']),
    length: z.enum(['headlines', 'balanced', 'thorough']),
    signoff: z.string(),
    voiceSample: z.string(),
  }),
});

/**
 * POST /api/reports/generate
 *
 * Pulls the reporting window's activity from every connected source and runs
 * the narrative agent. Returns a drafted report, or an `insufficient` verdict
 * when the week was too quiet to draft honestly.
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

  const since = new Date(parsed.data.period.since);
  const until = new Date(parsed.data.period.until);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
    return badRequest('The reporting period needs valid since/until dates.');
  }
  if (since.getTime() > until.getTime()) {
    return badRequest('The reporting period "since" must not be after "until".');
  }

  try {
    const digests = [];
    for (const connection of parsed.data.connections) {
      const connector = createConnectorForConnection(connection);
      digests.push(await connector.fetchActivity({ since, until }));
    }
    const result = await generateStatusReport({
      client: { name: parsed.data.client.name },
      period: { since, until },
      digests,
      voice: parsed.data.voice,
    });
    // `sourceEvents` lets onboarding persist a report with full provenance.
    return Response.json({ ok: true, ...result, sourceEvents: digests.flatMap((d) => d.events) });
  } catch (error) {
    if (error instanceof ConnectorError) {
      return connectorErrorResponse(error);
    }
    return Response.json(
      {
        ok: false,
        error: {
          code: 'generation_failed',
          message: "We couldn't generate the report just now. Try again in a moment.",
        },
      },
      { status: 502 },
    );
  }
}
