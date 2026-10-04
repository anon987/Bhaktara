import {
  createTimer,
  formatTime,
  localPracticeDay,
  malaProgress,
  pauseTimer,
  remainingAt,
  startTimer,
} from "../src/domain/practice";
import { resolveBannerTarget } from "../src/app/navigation/routes";
import { canPlaceAd, requiresRewardedAd } from "../src/services/integrations";
import {
  localStateSchema,
  initialState,
} from "../src/services/storage/localStore";
import { contentSchema } from "../src/domain/models";
import { fixtures } from "../src/repositories/fixtures";
import {
  filterContent,
  mockContentRepository,
} from "../src/repositories/mockRepository";
import { strings, translate } from "../src/i18n/strings";
describe("local practice (never authoritative progression)", () => {
  test("mala boundaries preserve counts across multiple malas", () => {
    expect(malaProgress(107)).toEqual({ malas: 0, beads: 107 });
    expect(malaProgress(108)).toEqual({ malas: 1, beads: 0 });
    expect(malaProgress(217)).toEqual({ malas: 2, beads: 1 });
  });
  test("timer uses deadlines, survives delayed/background ticks, and never goes negative", () => {
    const running = startTimer(createTimer(300), 1000);
    expect(remainingAt(running, 121000)).toBe(180);
    expect(remainingAt(running, 900000)).toBe(0);
    expect(remainingAt(JSON.parse(JSON.stringify(running)), 2000)).toBe(299);
  });
  test("pause and resume exclude paused wall time", () => {
    const paused = pauseTimer(startTimer(createTimer(300), 0), 120000);
    expect(remainingAt(paused, 900000)).toBe(180);
    expect(remainingAt(startTimer(paused, 900000), 960000)).toBe(120);
  });
  test("local day switches at 04:00, including month/year boundary", () => {
    expect(localPracticeDay(new Date(2026, 0, 1, 3, 59))).toBe("2025-12-31");
    expect(localPracticeDay(new Date(2026, 0, 1, 4, 0))).toBe("2026-01-01");
    expect(formatTime(305)).toBe("5:05");
  });
});
describe("V1 boundaries", () => {
  test.each([
    "https://example.com",
    { route: "https://example.com" },
    { route: "mandir", url: "https://example.com" },
    null,
    { route: "scripture" },
  ])("rejects unsupported banner target %p", (value) =>
    expect(resolveBannerTarget(value)).toBe("Home"),
  );
  test("known internal targets resolve", () => {
    expect(resolveBannerTarget({ route: "mandir" })).toBe("Mandir");
    expect(resolveBannerTarget({ route: "sadhana" })).toBe("Sadhana");
  });
  test("WhatsApp is free; saves and special offerings disclose ads", () => {
    expect(requiresRewardedAd("whatsapp-share")).toBe(false);
    expect(requiresRewardedAd("save")).toBe(true);
    expect(requiresRewardedAd("offering")).toBe(true);
  });
  test("repeated-tap zones reject ad placements", () => {
    expect(canPlaceAd("jaap-controls")).toBe(false);
    expect(canPlaceAd("mandir-controls")).toBe(false);
    expect(canPlaceAd("content-rail")).toBe(true);
  });
  test("local state rejects client-owned XP or corrupt counts", () => {
    expect(
      localStateSchema.safeParse({ ...initialState, totalXp: 9999 }).success,
    ).toBe(false);
    expect(
      localStateSchema.safeParse({ ...initialState, jaapCount: -1 }).success,
    ).toBe(false);
  });
});
describe("fixture repository and localization", () => {
  test("all content passes schema and excluded content types are rejected", () => {
    fixtures.content.forEach((item) =>
      expect(contentSchema.safeParse(item).success).toBe(true),
    );
    expect(
      contentSchema.safeParse({ ...fixtures.content[0], type: "SCRIPTURE" })
        .success,
    ).toBe(false);
  });
  test("search combines category, deity and Hindi or transliteration", () => {
    expect(
      filterContent({
        query: "हनुमान",
        type: "CHALISA",
        deityId: "hanuman",
      }).map((item) => item.id),
    ).toEqual(["chalisa-1"]);
    expect(
      filterContent({ query: "hanumaan", type: "CHALISA" }).map(
        (item) => item.id,
      ),
    ).toEqual(["chalisa-1"]);
    expect(filterContent({ query: "krishna", deityId: "shiva" })).toHaveLength(
      0,
    );
  });
  test("pagination has bounded, non-overlapping pages", async () => {
    const first = await mockContentRepository.search({ limit: 3 });
    const second = await mockContentRepository.search({
      offset: first.nextOffset,
      limit: 3,
    });
    expect(first.items).toHaveLength(3);
    expect(
      second.items.some((item) =>
        first.items.some((other) => item.id === other.id),
      ),
    ).toBe(false);
  });
  test("every UI key has non-empty Hindi and English text", () => {
    Object.keys(strings).forEach((key) => {
      expect(
        translate("hi", key as keyof typeof strings).length,
      ).toBeGreaterThan(0);
      expect(
        translate("en", key as keyof typeof strings).length,
      ).toBeGreaterThan(0);
    });
  });
});
