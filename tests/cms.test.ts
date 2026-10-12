import {
  adminRoles,
  allowedTransitions,
  bannerInputSchema,
  bannerRoutes,
  can,
  contentDraftSchema,
  ContentDraftInput,
  contentStatuses,
  createContentSchema,
  draftFromDocuments,
  readinessProblems,
  saveContentSchema,
  transitions,
} from "../src/domain/cms";
import { checkItems, checkLabels } from "../src/domain/checklist";
import {
  contentIdBase,
  generateContentId,
  slugify,
  transliterateHindi,
} from "../src/domain/contentId";
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
    private: {},
    ...overrides,
  });
const wallpaperMedia = {
  thumb: { key: "wallpaper/w1/thumb.0123abcd.webp" },
  mobile: { key: "wallpaper/w1/mobile.0123abcd.webp" },
  full: { key: "wallpaper/w1/full.0123abcd.png" },
};

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

describe("readiness (doc 09 §3)", () => {
  it("passes a complete item and lists every gap otherwise", () => {
    expect(readinessProblems(draft())).toEqual([]);
    const gaps = readinessProblems(
      draft({
        title: { hi: "", en: "Bhajan" },
        description: { hi: "", en: "" },
        deityIds: [],
        media: { thumb: { key: "bhajan/b1/thumb.0123abcd.webp" } },
      }),
    ).map((problem) => problem.field);
    expect(gaps).toEqual([
      "title.hi",
      "description.hi",
      "description.en",
      "deityIds",
      "media.stream",
    ]);
  });

  it("makes a wallpaper READY with titles, one deity and its media only", () => {
    expect(
      readinessProblems(
        draft({
          type: "WALLPAPER",
          description: { hi: "", en: "" },
          media: wallpaperMedia,
        }),
      ),
    ).toEqual([]);
    for (const type of ["RINGTONE", "STATUS"] as const)
      expect(
        readinessProblems(draft({ type, description: { hi: "", en: "" } })).map(
          (problem) => problem.field,
        ),
      ).not.toEqual(expect.arrayContaining([expect.stringMatching(/^desc/)]));
  });

  it("requires both descriptions for devotional audio types", () => {
    for (const type of ["BHAJAN", "AARTI", "MANTRA", "CHALISA"] as const)
      expect(
        readinessProblems(draft({ type, description: { hi: "", en: "" } })).map(
          (problem) => problem.field,
        ),
      ).toEqual(["description.hi", "description.en"]);
  });

  it("never gates on provenance, source text or the checklist", () => {
    for (const type of ["AARTI", "MANTRA", "CHALISA"] as const)
      expect(readinessProblems(draft({ type }))).toEqual([]);
    expect(readinessProblems(draft({ type: "RINGTONE" }))).toEqual([
      { field: "media.file", message: 'RINGTONE needs a "file" media key' },
    ]);
    // Old documents with partial checklists and provenance still parse.
    expect(
      readinessProblems(
        draft({
          private: { aiTool: "Tool", checklist: { titleChecked: false } },
        }),
      ),
    ).toEqual([]);
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

describe("content IDs", () => {
  it("accepts a missing or blank ID on create but not on update", () => {
    const body = { ...draft(), private: undefined };
    for (const id of [undefined, "", "  "])
      expect(createContentSchema.parse({ id, draft: body }).id).toBeUndefined();
    expect(createContentSchema.parse({ id: "bulk-1", draft: draft() }).id).toBe(
      "bulk-1",
    );
    expect(
      createContentSchema.safeParse({ id: "Bad Id", draft: draft() }).success,
    ).toBe(false);
    expect(saveContentSchema.safeParse({ draft: draft() }).success).toBe(false);
    // The private panel itself is optional input.
    expect(
      createContentSchema.parse({ draft: body }).draft.private.checklist,
    ).toEqual({});
  });

  it("builds readable slugs from the English, then Hindi title, then type", () => {
    expect(slugify("  Hanuman Chalisa — Morning (HD)! ")).toBe(
      "hanuman-chalisa-morning-hd",
    );
    expect(transliterateHindi("हनुमान चालीसा")).toBe("hanuman chalisa");
    expect(transliterateHindi("ॐ नमः शिवाय")).toBe("om namah shivay");
    expect(transliterateHindi("श्री संत")).toBe("shri sant");
    expect(
      contentIdBase({ type: "BHAJAN", title: { hi: "भजन", en: "Om Jai" } }),
    ).toBe("om-jai");
    expect(
      contentIdBase({
        type: "CHALISA",
        title: { hi: "हनुमान चालीसा", en: "" },
      }),
    ).toBe("hanuman-chalisa");
    expect(
      contentIdBase({ type: "WALLPAPER", title: { hi: "", en: "!!!" } }),
    ).toBe("wallpaper");
    expect(
      contentIdBase({ type: "STATUS", title: { hi: "", en: "x".repeat(200) } })
        .length,
    ).toBeLessThanOrEqual(60);
  });

  it("generates valid, distinct slugs with a 4-character suffix", () => {
    const input = {
      type: "WALLPAPER" as const,
      title: { hi: "", en: "Hanuman Dawn" },
    };
    const ids = new Set(
      Array.from({ length: 200 }, () => generateContentId(input)),
    );
    expect(ids.size).toBeGreaterThan(190);
    for (const id of ids) {
      expect(id).toMatch(/^hanuman-dawn-[a-z0-9]{4}$/);
      expect(createContentSchema.parse({ id, draft: draft() }).id).toBe(id);
    }
    expect(generateContentId(input, () => 0)).toBe("hanuman-dawn-aaaa");
    expect(generateContentId(input, () => 0.9999)).toBe("hanuman-dawn-9999");
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
