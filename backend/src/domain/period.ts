/**
 * Named reporting periods, and the window before each one.
 *
 * Every money figure in the dashboard was LIFETIME: net revenue, refunds,
 * commission, per-event takings. That answers "how have we done ever", which
 * nobody asks twice, and leaves "how did October go" unanswerable — the only
 * time-aware number in the product was a this-week-vs-last-week pair on the
 * admin stats route.
 *
 * Pure date arithmetic, no Prisma and no HTTP, so the awkward parts (a month
 * that starts on the 1st, a year boundary, the fact that "last month" from
 * the 31st must not land on the 31st of a 30-day month) are unit-testable.
 *
 * All windows are HALF-OPEN: [start, end). Consecutive periods therefore
 * tile without overlapping, which is the same convention runPayout uses for
 * its payout window — an order at exactly midnight belongs to the later
 * period, once.
 *
 * Africa/Casablanca is UTC+1 year-round and the only market this sells in, so
 * "today" is computed against that offset rather than the server's locale.
 * Getting this wrong puts an evening sale in the wrong day, which is exactly
 * when tickets sell.
 */

export const PERIOD_KEYS = ["today", "week", "month", "lastMonth", "year", "all"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export function isPeriodKey(value: unknown): value is PeriodKey {
  return typeof value === "string" && (PERIOD_KEYS as readonly string[]).includes(value);
}

/** Morocco is UTC+1 all year — no daylight saving since 2018. */
const OFFSET_MINUTES = 60;

/** The same instant, shifted so UTC date maths yields Casablanca calendar days. */
function toLocal(at: Date): Date {
  return new Date(at.getTime() + OFFSET_MINUTES * 60_000);
}

/** Back from the shifted clock to a real instant. */
function toUtc(local: Date): Date {
  return new Date(local.getTime() - OFFSET_MINUTES * 60_000);
}

function startOfLocalDay(at: Date): Date {
  const local = toLocal(at);
  return toUtc(new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())));
}

function addLocalDays(at: Date, days: number): Date {
  const local = toLocal(at);
  local.setUTCDate(local.getUTCDate() + days);
  return toUtc(local);
}

function startOfLocalMonth(at: Date, monthsBack = 0): Date {
  const local = toLocal(at);
  return toUtc(new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - monthsBack, 1)));
}

function startOfLocalYear(at: Date): Date {
  const local = toLocal(at);
  return toUtc(new Date(Date.UTC(local.getUTCFullYear(), 0, 1)));
}

/** A half-open window. `start` null means "since the beginning". */
export interface Window {
  start: Date | null;
  end: Date | null;
}

/**
 * The window a named period covers, as of `now`.
 *
 * `end` is null for periods that run up to the present: an open end means
 * "and anything since", so a sale made while the page is open still counts
 * rather than being cut off at page load.
 */
export function windowFor(key: PeriodKey, now = new Date()): Window {
  switch (key) {
    case "today":
      return { start: startOfLocalDay(now), end: null };
    case "week":
      // Monday-based: Morocco's working week, and what "this week" means to
      // someone looking at a sales figure on a Thursday.
      return { start: startOfLocalWeek(now), end: null };
    case "month":
      return { start: startOfLocalMonth(now), end: null };
    case "lastMonth": {
      // The only CLOSED window: last month is over, so it has a real end.
      // Computed from the 1st of each month rather than by subtracting 30
      // days, which would land mid-month from a 31st.
      return { start: startOfLocalMonth(now, 1), end: startOfLocalMonth(now) };
    }
    case "year":
      return { start: startOfLocalYear(now), end: null };
    case "all":
    default:
      return { start: null, end: null };
  }
}

function startOfLocalWeek(at: Date): Date {
  const day = toLocal(at).getUTCDay(); // 0 = Sunday
  const sinceMonday = (day + 6) % 7;
  return startOfLocalDay(addLocalDays(at, -sinceMonday));
}

/**
 * The equivalent window immediately before this one, for a "vs previous"
 * delta.
 *
 * A figure with no comparison is a number; with one it is a direction, which
 * is the thing someone actually wants from a dashboard. Returns null where a
 * comparison would mislead: "all time" has no previous, and a partial period
 * is compared against the SAME span of the previous one — eight days into
 * October against the first eight days of September, not against all of it,
 * which would always read as a collapse.
 */
export function previousWindow(key: PeriodKey, now = new Date()): Window | null {
  if (key === "all") return null;

  const current = windowFor(key, now);
  if (!current.start) return null;

  const end = current.end ?? now;
  const elapsed = end.getTime() - current.start.getTime();

  switch (key) {
    case "today":
      return { start: addLocalDays(current.start, -1), end: addLocalDays(end, -1) };
    case "week":
      return { start: addLocalDays(current.start, -7), end: addLocalDays(end, -7) };
    case "month": {
      // Same number of days into the previous month, so a comparison made on
      // the 8th weighs eight days against eight.
      const prevStart = startOfLocalMonth(now, 1);
      return { start: prevStart, end: new Date(prevStart.getTime() + elapsed) };
    }
    case "lastMonth": {
      const prevStart = startOfLocalMonth(now, 2);
      return { start: prevStart, end: startOfLocalMonth(now, 1) };
    }
    case "year": {
      const local = toLocal(now);
      const prevStart = toUtc(new Date(Date.UTC(local.getUTCFullYear() - 1, 0, 1)));
      return { start: prevStart, end: new Date(prevStart.getTime() + elapsed) };
    }
    default:
      return null;
  }
}

/**
 * A Prisma `createdAt` filter for a window, or undefined for all time.
 *
 * Returns undefined rather than `{}` so a caller can spread it into a where
 * clause unconditionally — `...dateFilter(w)` adds nothing when the period is
 * "all", instead of adding an empty object that reads like a forgotten
 * condition.
 */
export function dateFilter(window: Window): { createdAt: { gte?: Date; lt?: Date } } | undefined {
  if (!window.start && !window.end) return undefined;
  return {
    createdAt: {
      ...(window.start ? { gte: window.start } : {}),
      ...(window.end ? { lt: window.end } : {}),
    },
  };
}

/**
 * Evenly spaced buckets across a window, for a bar chart.
 *
 * Daily up to about ten weeks, weekly beyond — a year of daily bars is 365
 * slivers nobody can read, and a week of weekly ones is a single bar. The
 * boundary is in days rather than by period name so a custom range gets the
 * same treatment.
 */
export function bucketsFor(window: Window, now = new Date()): { start: Date; end: Date }[] {
  const start = window.start ?? null;
  if (!start) return [];
  const end = window.end ?? now;

  const spanDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
  const weekly = spanDays > 70;
  const step = weekly ? 7 : 1;

  const buckets: { start: Date; end: Date }[] = [];
  let cursor = weekly ? startOfLocalWeek(start) : startOfLocalDay(start);
  // Guarded rather than `while (true)`: a bad window must not spin forever.
  for (let i = 0; i < 400 && cursor < end; i += 1) {
    const next = addLocalDays(cursor, step);
    buckets.push({ start: cursor, end: next });
    cursor = next;
  }
  return buckets;
}
