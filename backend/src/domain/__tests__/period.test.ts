import { describe, expect, it } from "vitest";
import { bucketsFor, dateFilter, isPeriodKey, previousWindow, windowFor } from "../period.js";

/*
 * Fixed instants, never `new Date()`: a test that passes in October and fails
 * in November is worse than no test. Casablanca is UTC+1, so 00:30 UTC is
 * already 01:30 local and belongs to the SAME local day — the shift is what
 * most of these assertions are really checking.
 */
const THU_15_OCT = new Date("2026-10-15T14:00:00.000Z");
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("windowFor", () => {
  it("starts today at local midnight, which is 23:00 UTC the day before", () => {
    const w = windowFor("today", THU_15_OCT);
    expect(iso(w.start)).toBe("2026-10-14T23:00:00.000Z");
    // Open-ended, so a sale made while the page is open still counts.
    expect(w.end).toBeNull();
  });

  it("puts an evening sale in the right local day", () => {
    // 23:30 local on the 15th = 22:30 UTC. It must fall INSIDE "today".
    const evening = new Date("2026-10-15T22:30:00.000Z");
    const w = windowFor("today", evening);
    expect(evening >= w.start!).toBe(true);
    expect(iso(w.start)).toBe("2026-10-14T23:00:00.000Z");
  });

  it("starts the week on Monday", () => {
    // The 15th of October 2026 is a Thursday; Monday is the 12th.
    expect(iso(windowFor("week", THU_15_OCT).start)).toBe("2026-10-11T23:00:00.000Z");
  });

  it("starts the week on Monday when today IS Monday", () => {
    const mon = new Date("2026-10-12T09:00:00.000Z");
    expect(iso(windowFor("week", mon).start)).toBe("2026-10-11T23:00:00.000Z");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    const sun = new Date("2026-10-18T09:00:00.000Z");
    expect(iso(windowFor("week", sun).start)).toBe("2026-10-11T23:00:00.000Z");
  });

  it("starts the month on the 1st", () => {
    expect(iso(windowFor("month", THU_15_OCT).start)).toBe("2026-09-30T23:00:00.000Z");
  });

  it("closes last month at the start of this one", () => {
    const w = windowFor("lastMonth", THU_15_OCT);
    expect(iso(w.start)).toBe("2026-08-31T23:00:00.000Z");
    expect(iso(w.end)).toBe("2026-09-30T23:00:00.000Z");
  });

  it("does not land mid-month when today is the 31st", () => {
    // Subtracting 30 days from 31 Oct gives 1 Oct, not September at all.
    const w = windowFor("lastMonth", new Date("2026-10-31T12:00:00.000Z"));
    expect(iso(w.start)).toBe("2026-08-31T23:00:00.000Z");
    expect(iso(w.end)).toBe("2026-09-30T23:00:00.000Z");
  });

  it("crosses the year boundary for last month in January", () => {
    const w = windowFor("lastMonth", new Date("2027-01-10T12:00:00.000Z"));
    expect(iso(w.start)).toBe("2026-11-30T23:00:00.000Z");
    expect(iso(w.end)).toBe("2026-12-31T23:00:00.000Z");
  });

  it("has no bounds at all for all time", () => {
    expect(windowFor("all", THU_15_OCT)).toEqual({ start: null, end: null });
  });
});

describe("previousWindow", () => {
  it("has none for all time", () => {
    expect(previousWindow("all", THU_15_OCT)).toBeNull();
  });

  it("compares today against yesterday", () => {
    const p = previousWindow("today", THU_15_OCT)!;
    expect(iso(p.start)).toBe("2026-10-13T23:00:00.000Z");
  });

  it("compares a partial month against the SAME span of the previous one", () => {
    // Fifteen days into October must weigh against fifteen days of
    // September, not against all thirty — which would always read as a
    // collapse early in the month.
    const current = windowFor("month", THU_15_OCT);
    const p = previousWindow("month", THU_15_OCT)!;
    const elapsed = THU_15_OCT.getTime() - current.start!.getTime();
    expect(p.end!.getTime() - p.start!.getTime()).toBe(elapsed);
    expect(iso(p.start)).toBe("2026-08-31T23:00:00.000Z");
  });

  it("compares a CLOSED last month against the whole month before it", () => {
    const p = previousWindow("lastMonth", THU_15_OCT)!;
    expect(iso(p.start)).toBe("2026-07-31T23:00:00.000Z");
    expect(iso(p.end)).toBe("2026-08-31T23:00:00.000Z");
  });

  it("shifts a week back by exactly seven days", () => {
    const current = windowFor("week", THU_15_OCT);
    const p = previousWindow("week", THU_15_OCT)!;
    expect(current.start!.getTime() - p.start!.getTime()).toBe(7 * 86_400_000);
  });
});

describe("dateFilter", () => {
  it("is undefined for all time, so it can be spread into a where unconditionally", () => {
    expect(dateFilter({ start: null, end: null })).toBeUndefined();
  });

  it("is half-open: gte on the start, lt on the end", () => {
    const f = dateFilter(windowFor("lastMonth", THU_15_OCT))!;
    expect(f.createdAt.gte).toBeInstanceOf(Date);
    expect(f.createdAt.lt).toBeInstanceOf(Date);
    // lt, never lte — consecutive months must not both claim midnight.
    expect(Object.keys(f.createdAt)).toEqual(["gte", "lt"]);
  });

  it("omits the end for an open period", () => {
    const f = dateFilter(windowFor("month", THU_15_OCT))!;
    expect(f.createdAt.lt).toBeUndefined();
  });
});

describe("bucketsFor", () => {
  it("returns nothing for all time, which has no start to count from", () => {
    expect(bucketsFor({ start: null, end: null }, THU_15_OCT)).toEqual([]);
  });

  it("buckets a month by day", () => {
    const b = bucketsFor(windowFor("month", THU_15_OCT), THU_15_OCT);
    expect(b.length).toBe(15);
    expect(b[0].end.getTime() - b[0].start.getTime()).toBe(86_400_000);
  });

  it("switches to weekly past ten weeks, so a year is readable", () => {
    const b = bucketsFor(windowFor("year", THU_15_OCT), THU_15_OCT);
    expect(b.length).toBeLessThan(55);
    expect(b[0].end.getTime() - b[0].start.getTime()).toBe(7 * 86_400_000);
  });

  it("tiles without gaps or overlaps", () => {
    const b = bucketsFor(windowFor("month", THU_15_OCT), THU_15_OCT);
    for (let i = 1; i < b.length; i += 1) {
      expect(b[i].start.getTime()).toBe(b[i - 1].end.getTime());
    }
  });

  it("never runs away on a malformed window", () => {
    const b = bucketsFor({ start: new Date("2000-01-01T00:00:00Z"), end: null }, THU_15_OCT);
    expect(b.length).toBeLessThanOrEqual(400);
  });
});

describe("isPeriodKey", () => {
  it("accepts the known keys and nothing else", () => {
    expect(isPeriodKey("month")).toBe(true);
    expect(isPeriodKey("lastMonth")).toBe(true);
    expect(isPeriodKey("decade")).toBe(false);
    expect(isPeriodKey(undefined)).toBe(false);
    expect(isPeriodKey(7)).toBe(false);
  });
});
