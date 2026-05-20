import { describe, expect, it } from 'vitest';

import type { ClientReport } from '@/lib/dashboard/types';
import { renderReportPdf } from '@/lib/pdf/report-pdf';
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
  status: 'sent',
  generatedAt: '2026-05-17T09:00:00.000Z',
  eventsUsed: 2,
  draft: DRAFT,
  insufficientReason: null,
  sourceEvents: [],
  recipient: 'ops@vellum.co',
  sentAt: '2026-05-17T12:00:00.000Z',
};

describe('renderReportPdf', () => {
  it('renders a report to a non-empty PDF buffer', async () => {
    const buffer = await renderReportPdf(REPORT);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('throws when the report has no draft', async () => {
    await expect(renderReportPdf({ ...REPORT, draft: null })).rejects.toThrow();
  });
});
