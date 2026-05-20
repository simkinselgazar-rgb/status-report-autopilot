import { z } from 'zod';

import { badRequest, connectorErrorResponse } from '@/lib/connectors/http';
import { connectorEntry } from '@/lib/connectors/registry';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ source: string }> };

const workspaceSchema = z.object({
  workspaceId: z.string().min(1, 'A workspace is required.'),
});

/**
 * POST /api/connectors/[source]/projects
 *
 * Lists the connectable targets (projects / channels / hosts) in a workspace so
 * the onboarding connect step can let the PM pick which one this client's
 * reports are drawn from.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const { source } = await params;
  const entry = connectorEntry(source);
  if (!entry) return badRequest('Unknown connector.');

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest('Expected a JSON request body.');
  }

  const parsed = entry.credentials.and(workspaceSchema).safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Invalid request.');
  }

  try {
    const { workspaceId, ...credentials } = parsed.data;
    const projects = await entry.create(credentials).listProjects(workspaceId);
    return Response.json({ ok: true, projects });
  } catch (error) {
    return connectorErrorResponse(error);
  }
}
