import {
  buildHomeFeedSections,
  HomeCardSource,
  homeLayoutSectionsSchema,
  HomeLayoutSection,
  nextHomeBannerChange,
  resolveHomeBanners,
  resolveRailItems,
} from "../src/domain/home";
import { homeCollections, homeLayouts } from "../src/repositories/fixtures";
import { updateHomeLayoutSchema } from "../src/domain/cms";

const card = (
  id: string,
  type: HomeCardSource["type"],
  popularityScore?: number,
  publishedAt?: number,
): HomeCardSource => ({
  id,
  type,
  title: { en: id, hi: id },
  media: { thumb: { key: `thumb/${id}.webp` } },
  ...(popularityScore === undefined ? {} : { popularityScore }),
  ...(publishedAt === undefined ? {} : { publishedAt }),
});
const content = [
  card("bhajan-old", "BHAJAN", 50, 1_000),
  card("bhajan-new", "BHAJAN", 10, 5_000),
  card("aarti-mid", "AARTI", 80, 3_000),
  card("aarti-tie-b", "AARTI", 30, 4_000),
  card("aarti-tie-a", "AARTI", 30, 4_000),
  card("never-published", "MANTRA", 99),
];
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("rail sources", () => {
  it("defaults content rails to popularity, ties by id", () => {
    expect(ids(resolveRailItems({}, content))).toEqual([
      "never-published",
      "aarti-mid",
      "bhajan-old",
      "aarti-tie-a",
      "aarti-tie-b",
      "bhajan-new",
    ]);
  });

  it("sorts NEW by publish time, newest first, leaving unpublished out", () => {
    expect(ids(resolveRailItems({ source: { sort: "NEW" } }, content))).toEqual(
      ["bhajan-new", "aarti-tie-a", "aarti-tie-b", "aarti-mid", "bhajan-old"],
    );
    expect(
      ids(
        resolveRailItems(
          { source: { sort: "NEW", contentType: "AARTI" }, limit: 2 },
          content,
        ),
      ),
    ).toEqual(["aarti-tie-a", "aarti-tie-b"]);
  });

  it("keeps a collection's editorial order unless a sort is set", () => {
    const collections = [
      {
        id: "mixed",
        itemIds: [
          "bhajan-old",
          "missing",
          "aarti-mid",
          "bhajan-new",
          "aarti-mid",
        ],
      },
    ];
    const rail = (source: HomeLayoutSection["source"]) =>
      ids(resolveRailItems({ source }, content, collections));
    expect(rail({ collectionId: "mixed" })).toEqual([
      "bhajan-old",
      "aarti-mid",
      "bhajan-new",
    ]);
    expect(rail({ collectionId: "mixed", sort: "POPULAR" })).toEqual([
      "aarti-mid",
      "bhajan-old",
      "bhajan-new",
    ]);
    expect(rail({ collectionId: "mixed", sort: "NEW" })).toEqual([
      "bhajan-new",
      "aarti-mid",
      "bhajan-old",
    ]);
    expect(rail({ collectionId: "mixed", contentType: "BHAJAN" })).toEqual([
      "bhajan-old",
      "bhajan-new",
    ]);
    expect(rail({ collectionId: "unknown" })).toEqual([]);
  });

  it("clamps the limit to 1..20 and defaults to 10", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      card(`item-${String(index).padStart(2, "0")}`, "BHAJAN", 100 - index),
    );
    expect(resolveRailItems({}, many)).toHaveLength(10);
    expect(resolveRailItems({ limit: 0 }, many)).toHaveLength(1);
    expect(resolveRailItems({ limit: 99 }, many)).toHaveLength(20);
  });

  it("keeps input order for fixtures without scores", () => {
    const unscored = [card("b", "BHAJAN"), card("a", "BHAJAN")];
    expect(ids(resolveRailItems({}, unscored))).toEqual(["b", "a"]);
  });
});

describe("buildHomeFeedSections", () => {
  const layout: HomeLayoutSection[] = [
    { id: "banners", type: "BANNERS", order: 0, visible: true },
    {
      id: "new",
      type: "RAIL",
      title: { en: "New", hi: "नया" },
      source: { sort: "NEW" },
      limit: 2,
      order: 30,
      visible: true,
    },
    { id: "sadhana", type: "SADHANA", order: 10, visible: true },
    { id: "hidden", type: "PROGRESS", order: 5, visible: false },
    { id: "sadhana", type: "SADHANA", order: 1, visible: true },
    { id: "league", type: "LEAGUE", order: 20, visible: true },
  ];

  it("orders visible sections and drops hidden, BANNERS and duplicates", () => {
    const sections = buildHomeFeedSections(layout, content);
    expect(ids(sections as { id: string }[])).toEqual([
      "sadhana",
      "league",
      "new",
    ]);
    const rail = sections[2] as { items: Record<string, unknown>[] };
    expect("limit" in sections[2]).toBe(false);
    expect(ids(rail.items as { id: string }[])).toEqual([
      "bhajan-new",
      "aarti-tie-a",
    ]);
    // Card-level fields only: no ranking fields leak into the feed.
    expect(Object.keys(rail.items[0]).sort()).toEqual([
      "id",
      "media",
      "title",
      "type",
    ]);
  });

  it("reproduces the fixture layouts", () => {
    const sections = buildHomeFeedSections(
      homeLayouts.hi,
      content,
      homeCollections,
    );
    expect(ids(sections as { id: string }[])).toEqual([
      "sadhana",
      "shortcuts",
      "aarti-sangrah",
      "trending",
      "progress",
      "quote",
    ]);
  });
});

describe("layout schema", () => {
  it("accepts the fixture layouts", () => {
    for (const language of ["hi", "en"] as const)
      expect(
        homeLayoutSectionsSchema.safeParse(homeLayouts[language]).success,
      ).toBe(true);
  });

  const valid = homeLayouts.en;
  const rejects = (sections: unknown) =>
    expect(
      updateHomeLayoutSchema.safeParse({
        language: "en",
        sections,
        expectedRevision: 0,
      }).success,
    ).toBe(false);

  it("rejects malformed layouts", () => {
    rejects([...valid, valid[0]]);
    rejects([
      { id: "b1", type: "BANNERS", order: 0, visible: true },
      { id: "b2", type: "BANNERS", order: 1, visible: true },
    ]);
    rejects([{ id: "x", type: "HOROSCOPE", order: 0, visible: true }]);
    rejects([{ id: "Bad Id", type: "PROGRESS", order: 0, visible: true }]);
    rejects([{ id: "p", type: "PROGRESS", order: 0, visible: true, extra: 1 }]);
    rejects([{ id: "r", type: "RAIL", order: 0, visible: true }]);
    rejects([
      {
        id: "r",
        type: "RAIL",
        title: { en: "Rail", hi: "" },
        order: 0,
        visible: true,
      },
    ]);
    rejects([
      {
        id: "r",
        type: "RAIL",
        title: { en: "Rail", hi: "रेल" },
        limit: 21,
        order: 0,
        visible: true,
      },
    ]);
    rejects([
      {
        id: "s",
        type: "SHORTCUTS",
        order: 0,
        visible: true,
        items: [
          {
            label: { en: "Web", hi: "वेब" },
            iconKey: "web",
            target: { route: "https://example.com" },
          },
        ],
      },
    ]);
    rejects(
      Array.from({ length: 31 }, (_, index) => ({
        id: `p${index}`,
        type: "PROGRESS",
        order: index,
        visible: true,
      })),
    );
  });
});

describe("banners", () => {
  const at = (value: number) => ({ toMillis: () => value });
  const banner = (
    id: string,
    priority: number,
    window: [number, number],
    extra: { isActive?: boolean; languages?: string[] } = {},
  ) => ({
    id,
    title: { en: id, hi: id },
    subtitle: { en: "", hi: "" },
    ctaText: { en: "Open", hi: "खोलें" },
    image: { mobile: { key: `banner/${id}.webp` } },
    target: { route: "mandir" },
    priority,
    startAt: at(window[0]),
    endAt: at(window[1]),
    isActive: extra.isActive ?? true,
    languages: extra.languages ?? ["hi", "en"],
  });
  const now = 1_000;
  const banners = [
    banner("low", 1, [0, 2_000]),
    banner("high", 9, [0, 3_000]),
    banner("tie-b", 5, [0, 2_000]),
    banner("tie-a", 5, [0, 2_000]),
    banner("expired", 10, [0, 1_000]),
    banner("future", 10, [1_500, 4_000]),
    banner("inactive", 10, [0, 900_000], { isActive: false }),
    banner("hindi", 10, [0, 2_500], { languages: ["hi"] }),
  ];

  it("keeps live, active banners for the language by priority", () => {
    expect(ids(resolveHomeBanners(banners, "en", now))).toEqual([
      "high",
      "tie-a",
      "tie-b",
      "low",
    ]);
    expect(ids(resolveHomeBanners(banners, "hi", now))[0]).toBe("hindi");
    const [resolved] = resolveHomeBanners(banners, "en", now);
    expect(Object.keys(resolved).sort()).toEqual([
      "ctaText",
      "endAt",
      "id",
      "image",
      "startAt",
      "subtitle",
      "target",
      "title",
    ]);
  });

  it("caps banners at 10 and finds the next window change", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      banner(`b${index}`, index, [0, 2_000]),
    );
    expect(resolveHomeBanners(many, "en", now)).toHaveLength(10);
    expect(nextHomeBannerChange(banners, now)).toBe(1_500);
    expect(nextHomeBannerChange(banners, 5_000)).toBeNull();
  });
});
