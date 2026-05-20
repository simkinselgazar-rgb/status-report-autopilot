import { beforeEach, describe, expect, it, vi } from 'vitest';

// The data routes are agency-gated; a fake session lets the body-validation
// paths run, and `mockResolvedValueOnce(null)` exercises the 401 path.
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
  unauthorized: () =>
    Response.json(
      { ok: false, error: { code: 'unauthorized', message: 'Sign in required.' } },
      { status: 401 },
    ),
}));

import { POST as createClientRoute } from '@/app/api/clients/route';
import { PATCH as patchReportRoute } from '@/app/api/reports/[id]/route';
import { getSession } from '@/lib/auth/session';
import type { SourceEvent } from '@/lib/connectors/types';
import { getReportById, getReportByShareToken, toClientReport } from '@/lib/db/queries';
import type { ClientRow, ReportRow } from '@/lib/db/schema';
import type { StatusReportDraft } from '@/lib/reports/types';

const mockedSession = vi.mocked(getSession);

beforeEach(() => {
  mockedSession.mockReset();
  mockedSession.mockResolvedValue({ userId: 'demo-user' });
});

// --- fixtures --------------------------------------------------------------

const DRAFT: StatusReportDraft = {
  headline: 'The homepage moved into final review this week.',
  greeting: "Here's where things landed.",
  sections: [{ kind: 'shipped', items: [{ text: 'Designs cleared review.', sourceEventIds: ['e1'] }] }],
  signoff: 'The team',
};

const EVENT: SourceEvent = {
  id: 'e1',
  source: 'asana',
  kind: 'task_completed',
  title: 'Homepage design review',
  timestamp: '2026-05-13T10:00:00.000Z',
};

function client(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: 'client-1',
    name: 'Northwind Studio',
    recipient: 'maya@northwindstudio.com',
    voiceTone: 'professional',
    voiceLength: 'balanced',
    voiceSignoff: 'The team',
    voiceSample: '',
    cadenceDay: 'fri',
    cadenceTime: '9am',
    timezone: 'America/New_York',
    connections: [],
    createdAt: new Date('2026-05-10T00:00:00.000Z'),
    ...overrides,
  };
}

function report(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 'report-1',
    clientId: 'client-1',
    shareToken: 'a0000000-0000-4000-8000-000000000001',
    periodStart: '2026-06-08',
    periodLabel: 'Week of June 8–12',
    status: 'draft',
    generatedAt: '2026-05-17T09:00:00.000Z',
    eventsUsed: 6,
    draft: DRAFT,
    insufficientReason: null,
    sourceEvents: [EVENT],
    sentAt: null,
    createdAt: new Date('2026-05-17T09:00:00.000Z'),
    updatedAt: new Date('2026-05-17T09:00:00.000Z'),
    ...overrides,
  };
}

// --- toClientReport --------------------------------------------------------

describe('toClientReport', () => {
  it('folds a draft report + client into the dashboard view model', () => {
    const view = toClientReport(report(), client());
    expect(view).toEqual({
      id: 'report-1',
      shareToken: 'a0000000-0000-4000-8000-000000000001',
      clientName: 'Northwind Studio',
      periodLabel: 'Week of June 8–12',
      status: 'draft',
      generatedAt: '2026-05-17T09:00:00.000Z',
      eventsUsed: 6,
      draft: DRAFT,
      insufficientReason: null,
      sourceEvents: [EVENT],
      recipient: 'maya@northwindstudio.com',
      sentAt: null,
    });
  });

  it('keeps a null draft for an insufficient week and carries the reason', () => {
    const view = toClientReport(
      report({ status: 'insufficient', draft: null, insufficientReason: 'Too quiet.', eventsUsed: 2 }),
      client(),
    );
    expect(view.draft).toBeNull();
    expect(view.insufficientReason).toBe('Too quiet.');
    expect(view.status).toBe('insufficient');
  });

  it('carries sentAt through for a sent report', () => {
    const view = toClientReport(
      report({ status: 'sent', sentAt: '2026-05-17T12:00:00.000Z' }),
      client(),
    );
    expect(view.status).toBe('sent');
    expect(view.sentAt).toBe('2026-05-17T12:00:00.000Z');
  });

  it('reads name and recipient from the client, not the report', () => {
    const view = toClientReport(report(), client({ name: 'Harbor & Main', recipient: 'james@harborandmain.co' }));
    expect(view.clientName).toBe('Harbor & Main');
    expect(view.recipient).toBe('james@harborandmain.co');
  });
});

// --- getReportByShareToken -------------------------------------------------

describe('getReportByShareToken', () => {
  it('returns null for a non-uuid token without touching the database', async () => {
    expect(await getReportByShareToken('not-a-uuid')).toBeNull();
  });

  it('returns null for an empty token', async () => {
    expect(await getReportByShareToken('')).toBeNull();
  });
});

// --- getReportById ---------------------------------------------------------

describe('getReportById', () => {
  it('returns null for a non-uuid id without touching the database', async () => {
    expect(await getReportById('not-a-uuid')).toBeNull();
  });
});

// --- PATCH /api/reports/[id] -----------------------------------------------

describe('PATCH /api/reports/[id]', () => {
  function patch(body: unknown) {
    return patchReportRoute(
      new Request('http://test/api/reports/report-1', {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'report-1' }) },
    );
  }

  it('returns 401 without an agency session', async () => {
    mockedSession.mockResolvedValueOnce(null);
    const res = await patch({ status: 'draft' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-JSON body', async () => {
    const res = await patchReportRoute(
      new Request('http://test/api/reports/report-1', { method: 'PATCH', body: 'nope' }),
      { params: Promise.resolve({ id: 'report-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a body matching neither a draft nor a status', async () => {
    const res = await patch({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown status value', async () => {
    const res = await patch({ status: 'archived' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an incomplete draft', async () => {
    const res = await patch({ draft: { headline: 'only a headline' } });
    expect(res.status).toBe(400);
  });
});

// --- POST /api/clients -----------------------------------------------------

describe('POST /api/clients', () => {
  const validBody = {
    name: 'Northwind Studio',
    recipient: 'maya@northwindstudio.com',
    voice: { tone: 'professional', length: 'balanced', signoff: '', voiceSample: '' },
    cadence: { day: 'fri', time: '9am', timezone: 'America/New_York' },
    connections: [
      {
        source: 'asana',
        accessToken: 'tok',
        accountName: 'Northwind',
        workspaceName: 'Studio',
        projectId: 'P1',
        projectName: 'Site redesign',
      },
    ],
    report: {
      periodStart: '2026-06-08',
      periodLabel: 'Week of June 8–12',
      eventsUsed: 6,
      draft: DRAFT,
      sourceEvents: [EVENT],
    },
  };

  function post(body: unknown) {
    return createClientRoute(
      new Request('http://test/api/clients', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
    );
  }

  it('returns 401 without an agency session', async () => {
    mockedSession.mockResolvedValueOnce(null);
    const res = await post(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-JSON body', async () => {
    const res = await createClientRoute(
      new Request('http://test/api/clients', { method: 'POST', body: 'nope' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when the client name is missing', async () => {
    const res = await post({ ...validBody, name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid client email', async () => {
    const res = await post({ ...validBody, recipient: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown cadence day', async () => {
    const res = await post({
      ...validBody,
      cadence: { day: 'sun', time: '9am', timezone: 'America/New_York' },
    });
    expect(res.status).toBe(400);
  });
});
