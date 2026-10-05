import {
  adminRoles,
  allowedTransitions,
  bannerInputSchema,
  bannerRoutes,
  can,
  contentDraftSchema,
  ContentDraftInput,
  contentStatuses,
  draftFromDocuments,
  readinessProblems,
  transitions,
} from "../src/domain/cms";
import {
  applicableChecks,
  checkItems,
  checkLabels,
} from "../src/domain/checklist";
import { contentSearchTokens } from "../src/domain/search";
import { resolveBannerTarget } from "../src/app/navigation/routes";

const draft = (overrides: Partial<ContentDraftInput> = {}) =>
  contentDraftSchema.parse({
    type: "BHAJAN",
    title: { hi: "भजन", en: "Bhajan" },
    description: { hi: "विवरण", en: "Description" },
    deityIds: ["krishna"],
    categoryIds: [],
    tags: [],
    media: {
      thumb: { key: "bhajan/b1/thumb.0123abcd.webp" },
      stream: { key: "bhajan/b1/stream.0123abcd.m4a" },
    },
    isFeatured: false,
    saveGate: "FREE",
    isShareable: true,
    adEligible: true,
    private: {
      aiTool: "Tool",
      aiPlan: "Pro",
      checklist: Object.fromEntries(
        applicableChecks("BHAJAN").map((item) => [item, true]),
      ),
    },
    ...overrides,
  });

describe("CMS roles and workflow (doc 09 §15, D-036)", () => {
  it("maps roles to permissions", () => {
    expect(can("SUPER_ADMIN", "role.write")).toBe(true);
    expect(can("CONTENT_ADMIN", "role.write")).toBe(false);
    expect(can("CONTENT_ADMIN", "content.publish")).toBe(true);
    expect(can("EDITOR", "content.edit")).toBe(true);
    expect(can("EDITOR", "content.publish")).toBe(false);
    expect(can("EDITOR", "banner.write")).toBe(false);
    for (const role of ["MODERATOR", "ANALYST"] as const)
      expect(can(role, "content.read")).toBe(false);
    expect(can(null, "content.read")).toBe(false);
  });

  it("allows only the D-036 moves, gated by role", () => {
    expect(allowedTransitions("DRAFT", "EDITOR")).toEqual(["READY"]);
    expect(allowedTransitions("READY", "EDITOR")).toEqual(["DRAFT"]);
    expect(allowedTransitions("PUBLISHED", "EDITOR")).toEqual([]);
    expect(allowedTransitions("READY", "CONTENT_ADMIN")).toEqual([
      "DRAFT",
      "SCHEDULED",
      "PUBLISHED",
    ]);
    expect(allowedTransitions("PUBLISHED", "SUPER_ADMIN")).toEqual([
      "DRAFT",
      "ARCHIVED",
    ]);
    expect(allowedTransitions("DRAFT", "ANALYST")).toEqual([]);
    // No state can skip READY on the way to going live.
    expect(transitions.DRAFT).not.toHaveProperty("PUBLISHED");
    expect(transitions.DRAFT).not.toHaveProperty("SCHEDULED");
    for (const from of contentStatuses)
      expect(transitions[from]).not.toHaveProperty(from);
    expect(adminRoles).toHaveLength(5);
  });
});

describe("readiness (doc 12 §3–§5)", () => {
  it("passes a complete item and lists every gap otherwise", () => {
    expect(readinessProblems(draft())).toEqual([]);
    const gaps = readinessProblems(
      draft({
        title: { hi: "", en: "Bhajan" },
        media: { thumb: { key: "bhajan/b1/thumb.0123abcd.webp" } },
        private: { checklist: { titleChecked: true } },
      }),
    ).map((problem) => problem.field);
    expect(gaps).toEqual([
      "title.hi",
      "media.stream",
      "private.aiTool",
      "private.aiPlan",
      ...applicableChecks("BHAJAN")
        .filter((item) => item !== "titleChecked")
        .map((item) => `checklist.${item}`),
    ]);
  });

  it("requires type-specific media and sacred source text", () => {
    const ringtone = readinessProblems(draft({ type: "RINGTONE" }));
    expect(ringtone.map((problem) => problem.field)).toEqual([
      "media.file",
      "checklist.cleanStartEnd",
      "checklist.loudEnough",
    ]);
    const mantra = readinessProblems(draft({ type: "MANTRA" })).map(
      (problem) => problem.field,
    );
    expect(mantra).toContain("private.sourceText");
    expect(mantra).toContain("private.sourceTextRef");
    expect(mantra).toContain("checklist.sanskritChecked");
  });

  it("labels every checklist item", () => {
    for (const item of checkItems) expect(checkLabels[item]).toBeTruthy();
  });

  it("rejects server-owned fields and URLs in drafts", () => {
    expect(
      contentDraftSchema.safeParse({ ...draft(), status: "PUBLISHED" }).success,
    ).toBe(false);
    expect(
      contentDraftSchema.safeParse({
        ...draft(),
        media: { thumb: { key: "https://example.com/a.png" } },
      }).success,
    ).toBe(false);
  });
});

describe("stored documents", () => {
  it("rebuild a draft with importer defaults for missing fields", () => {
    const rebuilt = contentDraftSchema.parse(
      draftFromDocuments(
        {
          type: "WALLPAPER",
          status: "PUBLISHED",
          title: { hi: "अ", en: "A" },
          description: { hi: "ब", en: "B" },
          deityIds: ["shiva"],
          media: { thumb: { key: "wallpaper/w/thumb.0123abcd.webp" } },
          expireAt: { toMillis: () => Date.UTC(2026, 11, 1) },
        },
        { checklist: { titleChecked: true, retired: true }, aiTool: "T" },
      ),
    );
    expect(rebuilt).toMatchObject({
      tags: [],
      categoryIds: [],
      isFeatured: false,
      saveGate: "REWARDED",
      isShareable: true,
      adEligible: true,
      expireAt: "2026-12-01T00:00:00.000Z",
      private: { aiTool: "T", checklist: { titleChecked: true } },
    });
  });

  it("index deity names, aliases and transliterated titles", () => {
    const tokens = contentSearchTokens(
      {
        title: { hi: "हनुमान चालीसा", en: "Hanumaan Chalisa" },
        tags: [],
        deityIds: ["hanuman", "unknown-deity"],
        categoryIds: [],
      },
      new Map([
        [
          "hanuman",
          { name: { hi: "हनुमान", en: "Hanuman" }, aliases: ["Bajrang"] },
        ],
      ]),
    );
    expect(tokens).toEqual(
      expect.arrayContaining(["hanuman", "ha", "bajrang", "unknovn"]),
    );
  });
});

describe("banners (doc 09 §7, D-015)", () => {
  const banner = {
    title: { hi: "आरती", en: "Aarti" },
    subtitle: { hi: "", en: "" },
    ctaText: { hi: "खोलें", en: "Open" },
    image: { mobile: { key: "banner/b/mobile.0123abcd.webp" } },
    target: { route: "sadhana" },
    priority: 1,
    startAt: "2026-10-01T00:00:00Z",
    endAt: "2026-10-02T00:00:00Z",
    isActive: true,
    languages: ["hi"],
  };

  it("accepts only whitelisted internal routes the app can open", () => {
    expect(bannerInputSchema.safeParse(banner).success).toBe(true);
    for (const route of bannerRoutes)
      expect(resolveBannerTarget({ route })).not.toBe("Home");
    for (const target of [
      { route: "https://evil.example" },
      { route: "mandir", params: { url: "x" } },
    ])
      expect(bannerInputSchema.safeParse({ ...banner, target }).success).toBe(
        false,
      );
  });

  it("needs an end after the start", () => {
    expect(
      bannerInputSchema.safeParse({ ...banner, endAt: banner.startAt }).success,
    ).toBe(false);
  });
});
