import {
  addDays,
  advanceStreak,
  bhaktiDayAt,
  bhaktiDayEndsAt,
  defaultGamificationConfig as config,
  gamificationConfigSchema,
  isValidTimeZone,
  levelForXp,
  levelProgress,
  mandirVisitInputSchema,
  rankForLevel,
  sadhanaConfigSchema,
  defaultSadhanaConfig,
  visibleStreak,
  weekEndsAt,
  weekStartDay,
  xpForLevel,
} from "../src/domain/progression";

describe("practice day (D-024)", () => {
  it("rolls over at 04:00 local time", () => {
    expect(bhaktiDayAt(new Date("2026-10-05T22:29:59Z"), "Asia/Kolkata")).toBe(
      "2026-10-05",
    );
    expect(bhaktiDayAt(new Date("2026-10-05T22:30:00Z"), "Asia/Kolkata")).toBe(
      "2026-10-06",
    );
    // Same instant, another timezone: 2026-10-05 18:30 in New York.
    expect(
      bhaktiDayAt(new Date("2026-10-05T22:30:00Z"), "America/New_York"),
    ).toBe("2026-10-05");
  });
  it("knows when the current day ends", () => {
    expect(
      bhaktiDayEndsAt(new Date("2026-10-05T04:30:00Z"), "Asia/Kolkata"),
    ).toEqual(new Date("2026-10-05T22:30:00Z"));
    // 03:00 IST: ends in one hour, not tomorrow.
    expect(
      bhaktiDayEndsAt(new Date("2026-10-05T21:30:00Z"), "Asia/Kolkata"),
    ).toEqual(new Date("2026-10-05T22:30:00Z"));
  });
  it("uses one India week from Monday 04:00 IST", () => {
    // Sunday 2026-10-11 23:00 IST is still the week of Monday 2026-10-05.
    expect(weekStartDay(new Date("2026-10-11T17:30:00Z"))).toBe("2026-10-05");
    // Monday 2026-10-12 03:59 IST: still the previous week.
    expect(weekStartDay(new Date("2026-10-11T22:29:00Z"))).toBe("2026-10-05");
    expect(weekStartDay(new Date("2026-10-11T22:30:00Z"))).toBe("2026-10-12");
    expect(weekEndsAt(new Date("2026-10-07T10:00:00Z"))).toEqual(
      new Date("2026-10-11T22:30:00Z"),
    );
  });
  it("validates timezones and adds days across months", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("levels and ranks (D-027)", () => {
  it("follows the configured curve", () => {
    expect(xpForLevel(1, config)).toBe(0);
    expect(xpForLevel(2, config)).toBe(50);
    expect(levelForXp(0, config)).toBe(1);
    expect(levelForXp(49, config)).toBe(1);
    expect(levelForXp(50, config)).toBe(2);
    expect(rankForLevel(4, config)).toBe("JIGYASU");
    expect(rankForLevel(5, config)).toBe("SADHAK");
    expect(rankForLevel(50, config)).toBe("PARAM_BHAKT");
  });
  it("reports progress into the current level", () => {
    const progress = levelProgress(75, config);
    expect(progress.level).toBe(2);
    expect(progress.xpIntoLevel).toBe(25);
    expect(progress.fraction).toBeGreaterThan(0);
    expect(progress.fraction).toBeLessThan(1);
  });
  it("ships valid default configuration", () => {
    expect(gamificationConfigSchema.parse(config)).toEqual(config);
    expect(sadhanaConfigSchema.parse(defaultSadhanaConfig)).toEqual(
      defaultSadhanaConfig,
    );
  });
});

describe("streak (D-026)", () => {
  const empty = { currentStreak: 0, longestStreak: 0, lastQualifyingDay: null };
  it("advances on consecutive days and never moves backwards", () => {
    const one = advanceStreak(empty, "2026-10-05");
    const two = advanceStreak(one, "2026-10-06");
    expect(two).toEqual({
      currentStreak: 2,
      longestStreak: 2,
      lastQualifyingDay: "2026-10-06",
    });
    expect(advanceStreak(two, "2026-10-06")).toBe(two);
    expect(advanceStreak(two, "2026-10-04")).toBe(two);
    expect(advanceStreak(two, "2026-10-09").currentStreak).toBe(1);
  });
  it("shows a lapsed streak as zero", () => {
    const state = {
      currentStreak: 4,
      longestStreak: 9,
      lastQualifyingDay: "2026-10-05",
    };
    expect(visibleStreak(state, "2026-10-05")).toBe(4);
    expect(visibleStreak(state, "2026-10-06")).toBe(4);
    expect(visibleStreak(state, "2026-10-07")).toBe(0);
  });
});

describe("Mandir visit input (D-058)", () => {
  it("takes an optional deity and practice day", () => {
    expect(mandirVisitInputSchema.safeParse({}).success).toBe(true);
    expect(
      mandirVisitInputSchema.safeParse({
        deityId: "shiva",
        bhaktiDay: "2026-10-14",
      }).success,
    ).toBe(true);
    expect(
      mandirVisitInputSchema.safeParse({ deityId: "../users" }).success,
    ).toBe(false);
    expect(
      mandirVisitInputSchema.safeParse({ bhaktiDay: "14-10-2026" }).success,
    ).toBe(false);
  });
});
