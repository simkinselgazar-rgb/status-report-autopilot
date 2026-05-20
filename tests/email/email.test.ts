import { render } from '@react-email/render';
import { describe, expect, it, vi } from 'vitest';

import type { ClientReport } from '@/lib/dashboard/types';
import { ReportEmail } from '@/lib/email/report-email';
import { sendReportEmail } from '@/lib/email/send';
import type { StatusReportDraft } from '@/lib/reports/types';

const DRAFT: StatusReportDraft = {
  headline: 'The billing rework cleared review this week.',
  greeting: 'A quick look at where the platform rebuild landed.',
  sections: [
    { kind: 'shipped', items: [{ text: 'Billing rework passed internal review.', sourceEventIds: ['e1'] }] },
    { kind: 'next', items: [{ text: 'The usage dashboard is up next week.', sourceEventIds: ['e2'] }] },
  ],
  signoff: 'The Vellum team',
};

const REPORT: ClientReport = {
  id: 'b0000000-0000-4000-8000-000000000001',
  shareToken: 'c0000000-0000-4000-8000-000000000001',
  clientName: 'Vellum Co.',
  periodLabel: 'Week of June 8–12',
  status: 'draft',
  generatedAt: '2026-05-17T09:00:00.000Z',
  eventsUsed: 2,
  draft: DRAFT,
  insufficientReason: null,
  sourceEvents: [],
  recipient: 'ops@vellum.co',
  sentAt: null,
};

describe('ReportEmail', () => {
  const props = {
    clientName: 'Vellum Co.',
    periodLabel: 'Week of June 8–12',
    draft: DRAFT,
    shareUrl: 'https://app.test/r/abc',
  };

  it('renders the report content into the email HTML', async () => {
    const html = await render(ReportEmail(props));
    expect(html).toContain('Vellum Co.');
    expect(html).toContain('The billing rework cleared review this week.');
    expect(html).toContain('A quick look at where the platform rebuild landed.');
    expect(html).toContain('Shipped this week');
    expect(html).toContain('Billing rework passed internal review.');
    expect(html).toContain('The usage dashboard is up next week.');
    expect(html).toContain('The Vellum team');
  });

  it('links to the public report', async () => {
    const html = await render(ReportEmail(props));
    expect(html).toContain('https://app.test/r/abc');
  });

  it('renders a tag-free plain-text version', async () => {
    const text = await render(ReportEmail(props), { plainText: true });
    expect(text).toContain('The billing rework cleared review this week.');
    expect(text).toContain('Billing rework passed internal review.');
    expect(text).not.toContain('<');
  });
});

describe('sendReportEmail', () => {
  it('skips the send when RESEND_API_KEY is not set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendReportEmail(REPORT);
    expect(result).toEqual({ status: 'skipped' });
    warn.mockRestore();
  });

  it('throws when the report has no draft', async () => {
    await expect(sendReportEmail({ ...REPORT, draft: null })).rejects.toThrow();
  });
});
