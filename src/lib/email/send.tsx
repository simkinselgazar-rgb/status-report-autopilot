/**
 * Sends an approved report to its client by email (Resend).
 *
 * Called from the approve path. Without a `RESEND_API_KEY` the send is skipped
 * so dev works with no email provider; a real Resend failure throws, and the
 * caller leaves the report a draft rather than marking it sent.
 */

import { render } from '@react-email/render';
import { Resend } from 'resend';

import type { ClientReport } from '@/lib/dashboard/types';
import { env } from '@/lib/env';
import { renderReportPdf } from '@/lib/pdf/report-pdf';
import { ReportEmail } from './report-email';

export type SendReportEmailResult = { status: 'sent'; id: string } | { status: 'skipped' };

export async function sendReportEmail(report: ClientReport): Promise<SendReportEmailResult> {
  if (!report.draft) {
    throw new Error('Cannot email a report with no draft.');
  }
  if (!env.resendApiKey) {
    console.warn(`[email] RESEND_API_KEY unset, skipping send for report ${report.id}`);
    return { status: 'skipped' };
  }

  const email = (
    <ReportEmail
      clientName={report.clientName}
      periodLabel={report.periodLabel}
      draft={report.draft}
      shareUrl={`${env.appUrl}/r/${report.shareToken}`}
    />
  );
  const [html, text, pdf] = await Promise.all([
    render(email),
    render(email, { plainText: true }),
    renderReportPdf(report),
  ]);

  const resend = new Resend(env.resendApiKey);
  const { data, error } = await resend.emails.send({
    from: env.emailFrom,
    to: report.recipient,
    subject: `Weekly status update, ${report.periodLabel}`,
    html,
    text,
    attachments: [{ filename: `Status report, ${report.periodLabel}.pdf`, content: pdf }],
  });

  if (error) {
    throw new Error(`Resend rejected the email: ${error.message}`);
  }
  return { status: 'sent', id: data!.id };
}
