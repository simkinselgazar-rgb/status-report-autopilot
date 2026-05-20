import { describe, expect, it } from 'vitest';

import { cadenceMoment, previousReportWeek } from '@/lib/reports/period';

describe('previousReportWeek', () => {
  it('returns the prior Mon–Fri week for a weekday, in the given timezone', () => {
    // 2026-05-18 is a Monday; 12:00 UTC is 08:00 EDT.
    const week = previousReportWeek(new Date('2026-05-18T12:00:00Z'), 'America/New_York');
    expect(week.periodStart).toBe('2026-05-11');
    expect(week.since.toISOString()).toBe('2026-05-11T04:00:00.000Z');
    expect(week.until.toISOString()).toBe('2026-05-16T03:59:59.999Z');
  });

  it('treats Sunday as the tail of its Mon-start week', () => {
    // Sunday 2026-05-17 belongs to the week of Mon 2026-05-11 → prior week is May 4.
    const week = previousReportWeek(new Date('2026-05-17T12:00:00Z'), 'America/New_York');
    expect(week.periodStart).toBe('2026-05-04');
  });

  it('resolves the week in the client timezone, not UTC', () => {
    // Same instant: 23:00 Sun in New York, 12:00 Mon in Tokyo.
    const instant = new Date('2026-05-18T03:00:00Z');
    expect(previousReportWeek(instant, 'America/New_York').periodStart).toBe('2026-05-04');

    const tokyo = previousReportWeek(instant, 'Asia/Tokyo');
    expect(tokyo.periodStart).toBe('2026-05-11');
    expect(tokyo.since.toISOString()).toBe('2026-05-10T15:00:00.000Z');
    expect(tokyo.until.toISOString()).toBe('2026-05-15T14:59:59.999Z');
  });

  it('spans Monday 00:00 to Friday 23:59:59.999', () => {
    const week = previousReportWeek(new Date('2026-05-20T12:00:00Z'), 'UTC');
    expect(week.periodStart).toBe('2026-05-11');
    expect(week.since.toISOString()).toBe('2026-05-11T00:00:00.000Z');
    expect(week.until.toISOString()).toBe('2026-05-15T23:59:59.999Z');
  });
});

describe('cadenceMoment', () => {
  // 2026-05-20 is a Wednesday; its week runs Mon 05-18 … Fri 05-22.
  const wednesday = new Date('2026-05-20T12:00:00Z');

  it('resolves Friday 9am in the week containing now (Eastern)', () => {
    // Friday 2026-05-22, 09:00 EDT = 13:00 UTC.
    const moment = cadenceMoment(wednesday, 'America/New_York', 4, 9);
    expect(moment.toISOString()).toBe('2026-05-22T13:00:00.000Z');
  });

  it('resolves a Monday slot earlier in the same week', () => {
    // Monday 2026-05-18, 07:00 EDT = 11:00 UTC.
    const moment = cadenceMoment(wednesday, 'America/New_York', 0, 7);
    expect(moment.toISOString()).toBe('2026-05-18T11:00:00.000Z');
  });

  it('resolves the slot in the given timezone', () => {
    // Friday 2026-05-22, 09:00 JST = 00:00 UTC.
    const moment = cadenceMoment(wednesday, 'Asia/Tokyo', 4, 9);
    expect(moment.toISOString()).toBe('2026-05-22T00:00:00.000Z');
  });
});
