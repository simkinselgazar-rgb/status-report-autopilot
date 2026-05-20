import { getReportByShareToken } from '@/lib/db/queries';
import { renderReportPdf } from '@/lib/pdf/report-pdf';

export const runtime = 'nodejs';
/** Reads the product DB per request, never statically prerendered. */
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

/**
 * GET /r/[token]/pdf, the report as a downloadable PDF.
 *
 * Mirrors the public report page: only `sent` reports resolve, so the PDF
 * link never exposes an unapproved draft.
 */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { token } = await params;
  const report = await getReportByShareToken(token);

  if (!report || report.status !== 'sent' || !report.draft) {
    return new Response('Report not found.', { status: 404 });
  }

  const pdf = await renderReportPdf(report);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'attachment; filename="status-report.pdf"',
    },
  });
}
