import { badRequest, connectorErrorResponse } from '@/lib/connectors/http';
import { connectorEntry } from '@/lib/connectors/registry';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ source: string }> };

/**
 * POST /api/connectors/[source]/verify
 *
 * The HTTP seam the onboarding connect step calls: confirms the pasted
 * credentials work and returns the connected identity (account + workspaces)
 * so the wizard can move on to picking a project.
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

  const parsed = entry.credentials.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Invalid request.');
  }

  try {
    const identity = await entry.create(parsed.data).verify();
    return Response.json({ ok: true, identity });
  } catch (error) {
    return connectorErrorResponse(error);
  }
}
