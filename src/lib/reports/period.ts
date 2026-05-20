/**
 * Reporting-period math.
 *
 * A status report covers a Monday–Friday calendar week. Recurring generation
 * and the onboarding magic-moment both file a report under the Monday of that
 * week (`periodStart`), and a report always covers the calendar week *before*
 * the one containing `now`, interpreted in the client's IANA timezone.
 */

export interface ReportWeek {
  /** Monday of the Mon–Fri week, `YYYY-MM-DD`, the persisted period key. */
  periodStart: string;
  /** Window start. Monday 00:00:00.000 in the timezone. */
  since: Date;
  /** Window end. Friday 23:59:59.999 in the timezone. */
  until: Date;
}

const DAY_MS = 86_400_000;
/** Monday-indexed: Mon = 0 … Sun = 6. */
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

/** The wall-clock parts of an instant as seen in a given IANA timezone. */
function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl can emit hour "24" at midnight, normalize to 0.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday ?? 'Mon',
  };
}

/** The UTC offset (ms) a timezone is at for a given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (instant.getTime() - instant.getMilliseconds());
}

/** The UTC instant for a wall-clock time stated in a timezone. */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const offset = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The Mon–Fri calendar week immediately before the week containing `now`,
 * interpreted in `timeZone`. A recurring report generated on any day of week W
 * covers week W−1.
 */
export function previousReportWeek(now: Date, timeZone: string): ReportWeek {
  const today = zonedParts(now, timeZone);
  const dow = WEEKDAY_INDEX[today.weekday] ?? 0;

  // Calendar arithmetic at UTC midnight (no DST), back to the previous Monday.
  const mondayUtc = Date.UTC(today.year, today.month - 1, today.day) - (dow + 7) * DAY_MS;
  const monday = new Date(mondayUtc);
  const friday = new Date(mondayUtc + 4 * DAY_MS);

  const since = zonedWallTimeToUtc(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    0,
    0,
    0,
    0,
    timeZone,
  );
  const until = zonedWallTimeToUtc(
    friday.getUTCFullYear(),
    friday.getUTCMonth() + 1,
    friday.getUTCDate(),
    23,
    59,
    59,
    999,
    timeZone,
  );
  const periodStart = isoDate(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
  );
  return { periodStart, since, until };
}

/**
 * The instant of a client's cadence slot in the calendar week containing
 * `now`, interpreted in `timeZone`. `dayIndex` is Monday-based (Mon = 0 …
 * Fri = 4); `hour` is the 24-hour local hour. Recurring generation treats a
 * client as due once `now` has passed this instant.
 */
export function cadenceMoment(
  now: Date,
  timeZone: string,
  dayIndex: number,
  hour: number,
): Date {
  const today = zonedParts(now, timeZone);
  const dow = WEEKDAY_INDEX[today.weekday] ?? 0;
  // Calendar arithmetic at UTC midnight, then shift to the cadence weekday.
  const slotUtc = Date.UTC(today.year, today.month - 1, today.day) + (dayIndex - dow) * DAY_MS;
  const slot = new Date(slotUtc);
  return zonedWallTimeToUtc(
    slot.getUTCFullYear(),
    slot.getUTCMonth() + 1,
    slot.getUTCDate(),
    hour,
    0,
    0,
    0,
    timeZone,
  );
}
