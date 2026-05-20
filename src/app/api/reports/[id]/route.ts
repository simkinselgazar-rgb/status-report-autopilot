import { z } from 'zod';

import { getSession, unauthorized } from '@/lib/auth/session';
import { badRequest } from '@/lib/connectors/http';
import { getReportById, setReportStatus, updateReportDraft } from '@/lib/db/queries';
import { sendReportEmail } from '@/lib/email/send';
import { statusReportDraftSchema } from '@/lib/reports/types';

export const runtime = 'nodejs';

/** A PATCH either rewrites the draft (a PM inline-edit) or moves its status. */
const patchSchema = z.union([
  z.object({ draft: statusReportDraftSchema }),
  z.object({ status: z.enum(['draft', 'sent', 'insufficient']) }),
]);

type RouteContext = { params: Promise<{ id: string }> };

function notFound(): Response {
  return Response.json(
    { ok: false, error: { code: 'not_found', message: 'No report with that id.' } },
    { status: 404 },
  );
}

/**
 * PATCH /api/reports/[id]
 *
 * Persists a dashboard mutation: a draft edit, or an approve/undo status move.
 * Approving (`status: 'sent'`) emails the client first, the report only flips
 * to sent once the email is away, so a failed send leaves it a draft to retry.
 */
export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  if (!(await getSession())) return unauthorized();

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest('Expected a JSON request body.');
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Invalid request.');
  }
  const data = parsed.data;

  // A PM inline-edit, persist the draft and return.
  if ('draft' in data) {
    const ok = await updateReportDraft(id, data.draft);
    return ok ? Response.json({ ok: true }) : notFound();
  }

  // Approve & send, email the client first; only mark sent if that succeeds.
  if (data.status === 'sent') {
    const report = await getReportById(id);
    if (!report) return notFound();
    if (report.status !== 'draft' || !report.draft) {
      return badRequest('Only a draft report can be sent.');
    }
    try {
      await sendReportEmail(report);
    } catch (error) {
      console.error(`[email] send failed for report ${id}:`, error);
      return Response.json(
        {
          ok: false,
          error: {
            code: 'email_failed',
            message: "We couldn't send the email, the report is still a draft. Try again.",
          },
        },
        { status: 502 },
      );
    }
    await setReportStatus(id, 'sent');
    return Response.json({ ok: true });
  }

  // A plain status move, an undo back to draft, or marking a quiet week.
  const ok = await setReportStatus(id, data.status);
  return ok ? Response.json({ ok: true }) : notFound();
}
