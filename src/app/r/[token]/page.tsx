import { notFound } from 'next/navigation';

import { PublicReport } from '@/components/public/public-report';
import { getReportByShareToken } from '@/lib/db/queries';

/** Reads the product DB per request, never statically prerendered. */
export const dynamic = 'force-dynamic';

/**
 * GET /r/[token], the public shareable report.
 *
 * Only `sent` reports are viewable; an unknown token, a draft, or a quiet week
 * all 404, so the link never exposes work the PM has not approved.
 */
export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getReportByShareToken(token);

  if (!report || report.status !== 'sent' || !report.draft) {
    notFound();
  }

  return (
    <PublicReport
      clientName={report.clientName}
      periodLabel={report.periodLabel}
      draft={report.draft}
      sentAt={report.sentAt}
      pdfHref={`/r/${token}/pdf`}
    />
  );
}
