import { describe, expect, it } from 'vitest';

import type { ClientRow } from '@/lib/db/schema';
import { isDue, runDueReports, type RecurringDeps } from '@/lib/reports/recurring';

function client(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: 'c1',
    name: 'Northwind Studio',
    recipient: 'maya@northwind.com',
    voiceTone: 'professional',
    voiceLength: 'balanced',
    voiceSignoff: '',
    voiceSample: '',
    cadenceDay: 'mon',
    cadenceTime: '9am',
    timezone: 'America/New_York',
    connections: [],
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('isDue', () => {
  // A Friday 9am Eastern client, the cadence moment is 2026-05-22T13:00:00Z.
  const friday9 = client({ cadenceDay: 'fri', cadenceTime: '9am' });

  it('is not due before the cadence weekday', () => {
    expect(isDue(friday9, new Date('2026-05-21T12:00:00Z'))).toBe(false);
  });

  it('is not due earlier on the cadence day', () => {
    // 08:00 EDT, before the 09:00 slot.
    expect(isDue(friday9, new Date('2026-05-22T12:00:00Z'))).toBe(false);
  });

  it('is due once the cadence slot has passed', () => {
    // 10:00 EDT.
    expect(isDue(friday9, new Date('2026-05-22T14:00:00Z'))).toBe(true);
  });

  it('stays due through the rest of the week', () => {
    expect(isDue(friday9, new Date('2026-05-23T12:00:00Z'))).toBe(true);
  });

  it('resolves the cadence slot in the client timezone', () => {
    // Mon 9am: 13:00Z in New York, 00:00Z in Tokyo. At 2026-05-18T04:00:00Z
    // the Tokyo slot has passed (was 00:00Z) but the New York one has not.
    const instant = new Date('2026-05-18T04:00:00Z');
    expect(isDue(client({ timezone: 'Asia/Tokyo' }), instant)).toBe(true);
    expect(isDue(client({ timezone: 'America/New_York' }), instant)).toBe(false);
  });
});

describe('runDueReports', () => {
  // Wednesday 2026-05-20, 11:00 EDT.
  const NOW = new Date('2026-05-20T15:00:00Z');

  it('generates for due clients, skipping done weeks and isolating failures', async () => {
    const clients = [
      client({ id: 'a', cadenceDay: 'mon' }), // due → drafted
      client({ id: 'b', cadenceDay: 'wed' }), // due → insufficient
      client({ id: 'c', cadenceDay: 'fri' }), // not due (Friday hasn't arrived)
      client({ id: 'd', cadenceDay: 'mon' }), // due → already reported, skipped
      client({ id: 'e', cadenceDay: 'mon' }), // due → generation throws
    ];
    const deps: RecurringDeps = {
      listClients: async () => clients,
      reportExists: async (clientId) => clientId === 'd',
      generateForClient: async (c) => {
        if (c.id === 'e') throw new Error('connector down');
        return c.id === 'b' ? 'insufficient' : 'drafted';
      },
    };

    const summary = await runDueReports(NOW, deps);
    expect(summary).toMatchObject({
      checked: 5,
      due: 4,
      generated: 1,
      insufficient: 1,
      skipped: 1,
      failed: 1,
    });
    expect(summary.failures).toEqual([{ clientId: 'e', error: 'connector down' }]);
  });

  it('does nothing when no client is due', async () => {
    const deps: RecurringDeps = {
      listClients: async () => [client({ id: 'a', cadenceDay: 'fri' })],
      reportExists: async () => false,
      generateForClient: async () => {
        throw new Error('should not be called');
      },
    };
    const summary = await runDueReports(NOW, deps);
    expect(summary).toMatchObject({ checked: 1, due: 0, generated: 0, failed: 0 });
  });
});
