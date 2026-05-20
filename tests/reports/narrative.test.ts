import { beforeEach, describe, expect, it, vi } from 'vitest';

// The generate route is agency-gated; a fake session lets the body-validation
// paths run, and `mockResolvedValueOnce(null)` exercises the 401 path.
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
  unauthorized: () =>
    Response.json(
      { ok: false, error: { code: 'unauthorized', message: 'Sign in required.' } },
      { status: 401 },
    ),
}));

import type { ActivityDigest, SourceEvent, SourceEventKind } from '@/lib/connectors/types';
import {
  assessSufficiency,
  buildNarrativePrompt,
  finalizeDraft,
  formatPeriodLabel,
} from '@/lib/reports/digest-prompt';
import type { ReportVoice, StatusReportDraft } from '@/lib/reports/types';
import { POST as generateRoute } from '@/app/api/reports/generate/route';
import { getSession } from '@/lib/auth/session';

const mockedSession = vi.mocked(getSession);

beforeEach(() => {
  mockedSession.mockReset();
  mockedSession.mockResolvedValue({ userId: 'demo-user' });
});

// --- fixtures --------------------------------------------------------------

function makeEvent(id: string, overrides: Partial<SourceEvent> = {}): SourceEvent {
  return {
    id,
    source: 'asana',
    kind: 'task_completed' as SourceEventKind,
    title: `Task ${id}`,
    timestamp: '2026-05-13T10:00:00.000Z',
    ...overrides,
  };
}

function makeDigest(events: SourceEvent[], warnings: string[] = []): ActivityDigest {
  return {
    source: 'asana',
    window: {
      since: new Date('2026-05-11T00:00:00.000Z'),
      until: new Date('2026-05-15T23:59:59.999Z'),
    },
    fetchedAt: '2026-05-16T09:00:00.000Z',
    events,
    warnings,
    stats: { itemsScanned: events.length, eventsFound: events.length },
  };
}

const VOICE: ReportVoice = { tone: 'professional', length: 'balanced', signoff: '', voiceSample: '' };
const PERIOD = {
  since: new Date('2026-05-11T00:00:00.000Z'),
  until: new Date('2026-05-15T00:00:00.000Z'),
};

// --- assessSufficiency -----------------------------------------------------

describe('assessSufficiency', () => {
  it('flags an empty week as insufficient', () => {
    const verdict = assessSufficiency([makeDigest([])]);
    expect(verdict.sufficient).toBe(false);
    expect(verdict.eventCount).toBe(0);
    expect(verdict.reason).toMatch(/no activity/i);
  });

  it('flags a near-empty week as insufficient with a counted reason', () => {
    const verdict = assessSufficiency([makeDigest([makeEvent('a'), makeEvent('b')])]);
    expect(verdict.sufficient).toBe(false);
    expect(verdict.reason).toContain('2 updates');
  });

  it('uses the singular for a single update', () => {
    const verdict = assessSufficiency([makeDigest([makeEvent('a')])]);
    expect(verdict.reason).toContain('1 update this week');
    expect(verdict.reason).not.toContain('1 updates');
  });

  it('passes a week with enough activity', () => {
    const verdict = assessSufficiency([
      makeDigest([makeEvent('a'), makeEvent('b'), makeEvent('c'), makeEvent('d')]),
    ]);
    expect(verdict.sufficient).toBe(true);
    expect(verdict.eventCount).toBe(4);
    expect(verdict.reason).toBeNull();
  });
});

// --- formatPeriodLabel -----------------------------------------------------

describe('formatPeriodLabel', () => {
  it('formats a same-month window', () => {
    expect(
      formatPeriodLabel({
        since: new Date('2026-05-11T00:00:00.000Z'),
        until: new Date('2026-05-15T00:00:00.000Z'),
      }),
    ).toBe('Week of May 11–15');
  });

  it('formats a window that spans two months', () => {
    expect(
      formatPeriodLabel({
        since: new Date('2026-04-28T00:00:00.000Z'),
        until: new Date('2026-05-02T00:00:00.000Z'),
      }),
    ).toBe('Week of April 28–May 2');
  });
});

// --- buildNarrativePrompt --------------------------------------------------

describe('buildNarrativePrompt', () => {
  it('includes client, period, voice, and every event id', () => {
    const prompt = buildNarrativePrompt({
      client: { name: 'Northwind Studio' },
      period: PERIOD,
      digests: [makeDigest([makeEvent('e1'), makeEvent('e2')])],
      voice: VOICE,
    });
    expect(prompt).toContain('Northwind Studio');
    expect(prompt).toContain('Week of May 11–15');
    expect(prompt).toContain('professional, clear and neutral');
    expect(prompt).toContain('[e1]');
    expect(prompt).toContain('[e2]');
    expect(prompt.trimEnd().endsWith('Write the report now.')).toBe(true);
  });

  it('includes a voice sample and data notes when present', () => {
    const prompt = buildNarrativePrompt({
      client: { name: 'Acme' },
      period: PERIOD,
      digests: [makeDigest([makeEvent('e1')], ['Asana sync was partial.'])],
      voice: { ...VOICE, voiceSample: 'Plain words, no fluff.' },
    });
    expect(prompt).toContain('Plain words, no fluff.');
    expect(prompt).toContain('Data notes: Asana sync was partial.');
  });

  it('omits the writing-sample block when no sample is given', () => {
    const prompt = buildNarrativePrompt({
      client: { name: 'Acme' },
      period: PERIOD,
      digests: [makeDigest([makeEvent('e1')])],
      voice: VOICE,
    });
    expect(prompt).not.toContain('writing sample');
  });
});

// --- finalizeDraft ---------------------------------------------------------

describe('finalizeDraft', () => {
  const digests = [makeDigest([makeEvent('valid-1'), makeEvent('valid-2')])];

  function rawDraft(overrides: Partial<StatusReportDraft> = {}): StatusReportDraft {
    return {
      headline: 'A solid week.',
      greeting: 'Here is where things stand.',
      sections: [],
      signoff: 'The team',
      ...overrides,
    };
  }

  it('orders sections canonically and drops empty ones', () => {
    const draft = finalizeDraft(
      rawDraft({
        sections: [
          { kind: 'next', items: [{ text: 'Next up.', sourceEventIds: [] }] },
          { kind: 'blockers', items: [] },
          { kind: 'shipped', items: [{ text: 'Shipped it.', sourceEventIds: [] }] },
        ],
      }),
      { digests, voice: VOICE },
    );
    expect(draft.sections.map((s) => s.kind)).toEqual(['shipped', 'next']);
  });

  it('merges duplicate-kind sections', () => {
    const draft = finalizeDraft(
      rawDraft({
        sections: [
          { kind: 'shipped', items: [{ text: 'One.', sourceEventIds: [] }] },
          { kind: 'shipped', items: [{ text: 'Two.', sourceEventIds: [] }] },
        ],
      }),
      { digests, voice: VOICE },
    );
    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0]!.items).toHaveLength(2);
  });

  it('drops hallucinated source-event ids, keeps real ones', () => {
    const draft = finalizeDraft(
      rawDraft({
        sections: [
          {
            kind: 'shipped',
            items: [{ text: 'Done.', sourceEventIds: ['valid-1', 'made-up', 'valid-2'] }],
          },
        ],
      }),
      { digests, voice: VOICE },
    );
    expect(draft.sections[0]!.items[0]!.sourceEventIds).toEqual(['valid-1', 'valid-2']);
  });

  it('overrides the sign-off with the agency voice when one is set', () => {
    const draft = finalizeDraft(rawDraft(), {
      digests,
      voice: { ...VOICE, signoff: 'The Northwind crew' },
    });
    expect(draft.signoff).toBe('The Northwind crew');
  });

  it('keeps the generated sign-off when the agency left it blank', () => {
    const draft = finalizeDraft(rawDraft({ signoff: 'Your project team' }), {
      digests,
      voice: VOICE,
    });
    expect(draft.signoff).toBe('Your project team');
  });
});

// --- generate route guards -------------------------------------------------

describe('POST /api/reports/generate', () => {
  const validBody = {
    client: { name: 'Northwind Studio' },
    period: { since: '2026-05-11T00:00:00.000Z', until: '2026-05-15T00:00:00.000Z' },
    connections: [
      {
        source: 'asana',
        accessToken: 'tok',
        accountName: '',
        workspaceName: '',
        projectIds: ['P'],
        projectNames: [''],
      },
    ],
    voice: { tone: 'professional', length: 'balanced', signoff: '', voiceSample: '' },
  };

  function post(body: unknown) {
    return generateRoute(
      new Request('http://test/generate', {
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
    const res = await generateRoute(
      new Request('http://test/generate', { method: 'POST', body: 'nope' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when the client name is missing', async () => {
    const res = await post({ ...validBody, client: { name: '' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unparseable date', async () => {
    const res = await post({ ...validBody, period: { since: 'not-a-date', until: 'also-bad' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the period is inverted', async () => {
    const res = await post({
      ...validBody,
      period: { since: '2026-05-20T00:00:00.000Z', until: '2026-05-10T00:00:00.000Z' },
    });
    expect(res.status).toBe(400);
  });
});
