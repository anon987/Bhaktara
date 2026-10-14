import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminApi, ContentRecord } from "../api";
import { AdminProvider } from "../app/context";
import type { AdminRole, ContentStatus, ContentType } from "../domain";
import type { PanelApi } from "../panelApi";
import { callableError, fakeApi } from "../test/fakeApi";
import { ContentEditor } from "./ContentEditor";

const record = (status: ContentStatus = "DRAFT"): ContentRecord => ({
  id: "hanuman-chalisa",
  status,
  updatedAt: "2026-10-01T05:00:00.000Z",
  scheduledAt: null,
  publishedAt: null,
  draft: {
    type: "BHAJAN",
    title: { hi: "भजन", en: "Bhajan" },
    description: { hi: "", en: "A bhajan" },
    deityIds: ["hanuman"],
    categoryIds: [],
    tags: [],
    media: { thumb: { key: "bhajan/x/thumb.abcd1234.webp" } },
    isFeatured: false,
    saveGate: "FREE",
    isShareable: true,
    adEligible: true,
    private: { checklist: {} },
  },
});

type PanelStub = Partial<Record<keyof PanelApi, unknown>>;
const fakePanel = (overrides: PanelStub = {}) =>
  ({
    listCatalog: vi.fn(async (kind: string) =>
      kind === "deity"
        ? [
            { id: "hanuman", data: { name: { en: "Hanuman", hi: "हनुमान" } }, updatedAt: null },
            { id: "shiva", data: { name: { en: "Shiva", hi: "शिव" } }, updatedAt: null },
          ]
        : [{ id: "festival", data: { name: { en: "Festival", hi: "त्योहार" } }, updatedAt: null }],
    ),
    listContentTags: vi.fn(async () => ["aarti", "om"]),
    saveCatalogItem: vi.fn(async () => ({ id: "ganesha" })),
    ...overrides,
  }) as unknown as PanelApi;

function renderEditor(
  api: AdminApi,
  role: AdminRole,
  id?: string,
  panel?: PanelApi,
  type?: ContentType,
) {
  render(
    <AdminProvider api={api} panel={panel} role={role}>
      <ContentEditor id={id} type={type} />
    </AdminProvider>,
  );
}

const openPicker = async (name: string) =>
  userEvent.click(await screen.findByRole("combobox", { name: new RegExp(`^${name}`) }));
const searchPicker = (name: string, text: string) =>
  userEvent.type(screen.getByRole("combobox", { name: `Search ${name.toLowerCase()}` }), text);

describe("ContentEditor form", () => {
  it("shows what still blocks READY for a new draft, in plain words", async () => {
    renderEditor(fakeApi(), "EDITOR", undefined, undefined, "WALLPAPER");
    const status = await screen.findByRole("complementary", { name: "Status and media" });
    expect(within(status).getByText(/Needed before READY/)).toBeInTheDocument();
    // Wallpapers need only a name (from the file), not Hindi and English titles.
    expect(within(status).getByText(/A name is required/)).toBeInTheDocument();
    expect(within(status).queryByText(/Hindi title is required/)).not.toBeInTheDocument();
    expect(within(status).getByText(/At least one deity is required/)).toBeInTheDocument();
    expect(within(status).getByText(/Upload the wallpaper image/)).toBeInTheDocument();
    expect(within(status).queryByText(/media key/)).not.toBeInTheDocument();
  });

  it("has no ID, media key, provenance or checklist fields", async () => {
    renderEditor(fakeApi(), "EDITOR", undefined, fakePanel(), "WALLPAPER");
    await screen.findByLabelText("Name");
    expect(screen.queryByLabelText(/ID/)).not.toBeInTheDocument();
    expect(screen.queryByText("Media keys")).not.toBeInTheDocument();
    expect(screen.queryByText(/Provenance/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Checklist/)).not.toBeInTheDocument();
    // Audio-only fields are hidden for a wallpaper.
    expect(screen.queryByLabelText("Language of the audio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Duration/)).not.toBeInTheDocument();
    // The app never shows a wallpaper's name or description.
    expect(screen.queryByLabelText(/^Title in/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Description in/)).not.toBeInTheDocument();
  });

  it("asks for Hindi first on titled types", async () => {
    renderEditor(fakeApi(), "EDITOR", undefined, fakePanel(), "BHAJAN");
    await screen.findByLabelText("Title in Hindi");
    const titles = screen.getAllByLabelText(/^Title in/);
    expect(titles.map((input) => input.getAttribute("lang"))).toEqual(["hi", null]);
  });

  it("points a new item at the uploader", async () => {
    renderEditor(fakeApi(), "EDITOR", undefined, fakePanel(), "WALLPAPER");
    const media = await screen.findByRole("region", { name: "Media" });
    expect(media).toHaveTextContent("after you press “Create draft”");
    expect(within(media).getByRole("link", { name: /Upload files/ })).toHaveAttribute(
      "href",
      "#/upload/WALLPAPER",
    );
  });

  it("creates a draft with a generated ID", async () => {
    const api = fakeApi();
    renderEditor(api, "EDITOR", undefined, fakePanel(), "WALLPAPER");
    await userEvent.type(await screen.findByLabelText("Name"), "Hanuman Gold");
    await openPicker("Deities");
    await userEvent.click(await screen.findByRole("option", { name: /Hanuman/ }));
    await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
    expect(api.createContent).toHaveBeenCalledWith(
      expect.stringMatching(/^hanuman-gold-[a-z0-9]{4}$/),
      expect.objectContaining({
        type: "WALLPAPER",
        deityIds: ["hanuman"],
        title: { hi: "", en: "Hanuman Gold" },
      }),
    );
  });

  it("fills the empty title side with Gemini and leaves it editable", async () => {
    const api = fakeApi({
      localizeText: vi.fn(async ({ items }: { items: string[] }) =>
        items.map((text) =>
          text === "Om Jai Jagdish Hare"
            ? { language: "en" as const, en: text, hi: "ॐ जय जगदीश हरे" }
            : { language: "hi" as const, hi: text, en: "Ram Ka Naam Liye Ja" },
        ),
      ),
    });
    renderEditor(api, "EDITOR", undefined, fakePanel(), "AARTI");
    const fill = await screen.findByRole("button", { name: /Fill with Gemini/ });
    expect(fill).toBeDisabled();
    const hindi = screen.getByLabelText("Title in Hindi");
    const english = screen.getByLabelText("Title in English");

    // English in → Devanagari Hindi.
    await userEvent.type(english, "Om Jai Jagdish Hare");
    await userEvent.click(fill);
    expect(api.localizeText).toHaveBeenCalledWith({ kind: "title", items: ["Om Jai Jagdish Hare"] });
    expect(hindi).toHaveValue("ॐ जय जगदीश हरे");
    expect(english).toHaveValue("Om Jai Jagdish Hare");
    await userEvent.type(hindi, "!");
    expect(hindi).toHaveValue("ॐ जय जगदीश हरे!");
    // Both sides filled: nothing to do.
    expect(fill).toBeDisabled();

    // Hindi in → Hinglish English.
    await userEvent.clear(english);
    await userEvent.clear(hindi);
    await userEvent.click(hindi);
    await userEvent.paste("राम का नाम लिए जा");
    await userEvent.click(fill);
    expect(english).toHaveValue("Ram Ka Naam Liye Ja");
    expect(hindi).toHaveValue("राम का नाम लिए जा");
    expect(api.localizeText).toHaveBeenCalledTimes(2);
    expect(api.createContent).not.toHaveBeenCalled();
  });

  it("flags invalid fields instantly and does not call the server", async () => {
    const api = fakeApi();
    renderEditor(api, "EDITOR");
    const title = await screen.findByLabelText("Title in English");
    await userEvent.click(title);
    await userEvent.paste("x".repeat(121));
    expect(title).toHaveAttribute("aria-invalid", "true");
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Fix these fields before saving");

    await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
    expect(api.createContent).not.toHaveBeenCalled();
    expect(summary).toHaveFocus();
  });

  it("keeps stored provenance, checklist and media when saving", async () => {
    const stored = record();
    stored.draft.private = {
      aiTool: "Suno",
      aiPlan: "Pro",
      sourceTextRef: "Tulsidas",
      checklist: { titleChecked: true },
    };
    const api = fakeApi({ getContent: vi.fn(async () => stored) });
    renderEditor(api, "EDITOR", "hanuman-chalisa", fakePanel());
    await openPicker("Tags");
    await userEvent.click(await screen.findByRole("option", { name: "om" }));
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.updateContent).toHaveBeenCalledWith(
      "hanuman-chalisa",
      expect.objectContaining({
        tags: ["om"],
        media: stored.draft.media,
        private: expect.objectContaining({
          aiTool: "Suno",
          aiPlan: "Pro",
          sourceTextRef: "Tulsidas",
          checklist: { titleChecked: true },
        }),
      }),
    );
  });

  it("creates a deity from the picker when the role can edit the catalogue", async () => {
    const panel = fakePanel();
    renderEditor(fakeApi(), "CONTENT_ADMIN", undefined, panel);
    await openPicker("Deities");
    await searchPicker("Deities", "Ganesha");
    await userEvent.click(await screen.findByRole("option", { name: "Create “Ganesha”" }));
    await userEvent.type(screen.getByLabelText("Name in Hindi (optional)"), "गणेश");
    await userEvent.click(screen.getByRole("button", { name: "Create deity" }));
    expect(panel.saveCatalogItem).toHaveBeenCalledWith({
      kind: "deity",
      id: "ganesha",
      create: true,
      data: expect.objectContaining({
        name: { en: "Ganesha", hi: "गणेश" },
        isActive: false,
      }),
    });
    const chips = await screen.findByRole("list", { name: "Selected deities" });
    expect(chips).toHaveTextContent("Ganesha");
  });

  it("only offers to create tags, not deities, to an editor", async () => {
    renderEditor(fakeApi(), "EDITOR", undefined, fakePanel());
    await openPicker("Deities");
    await searchPicker("Deities", "Ganesha");
    expect(screen.queryByRole("option", { name: /Create/ })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await openPicker("Tags");
    await searchPicker("Tags", "navratri");
    await userEvent.click(screen.getByRole("option", { name: "Create “navratri”" }));
    expect(await screen.findByRole("list", { name: "Selected tags" })).toHaveTextContent("navratri");
  });

  it("shows server field errors from a rejected save", async () => {
    const api = fakeApi({
      getContent: vi.fn(async () => record()),
      updateContent: vi.fn(async () => {
        throw callableError("invalid-argument", "Some fields are invalid.", {
          issues: [{ path: "deityIds", message: "unknown deity vishnu" }],
        });
      }),
    });
    renderEditor(api, "EDITOR", "hanuman-chalisa");
    await userEvent.type(await screen.findByLabelText("Title in English"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Some fields are invalid");
    expect(alert).toHaveTextContent("Deities: unknown deity vishnu");
  });
});

describe("ContentEditor status transitions", () => {
  it("lists the checklist problems when the server refuses DRAFT → READY", async () => {
    const api = fakeApi({
      getContent: vi.fn(async () => record()),
      transitionContent: vi.fn(async () => {
        throw callableError(
          "failed-precondition",
          "The checklist or required fields are incomplete.",
          {
            reason: "CHECKLIST_INCOMPLETE",
            problems: [
              { field: "description.hi", message: "Hindi description is required" },
              {
                field: "checklist.titleChecked",
                message: "Checklist: Title correct in Hindi and English, spelling checked",
              },
            ],
          },
        );
      }),
    });
    renderEditor(api, "EDITOR", "hanuman-chalisa");
    await userEvent.click(await screen.findByRole("button", { name: "Move to READY" }));
    expect(api.transitionContent).toHaveBeenCalledWith({
      contentId: "hanuman-chalisa",
      to: "READY",
      scheduledAt: undefined,
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not ready yet");
    expect(alert).toHaveTextContent("Description (Hindi): Hindi description is required");
    expect(alert).toHaveTextContent(
      "Checklist: Title correct in Hindi and English, spelling checked",
    );
  });

  it("shows role limits and the server's permission refusal", async () => {
    const api = fakeApi({
      getContent: vi.fn(async () => record("READY")),
      transitionContent: vi.fn(async () => {
        throw callableError("permission-denied", "Your role (EDITOR) cannot do this.");
      }),
    });
    renderEditor(api, "EDITOR", "hanuman-chalisa");
    expect(
      await screen.findByText(/Publish now needs SUPER_ADMIN or CONTENT_ADMIN/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish now" })).not.toBeInTheDocument();
    expect(screen.getByText(/Move it back to DRAFT to edit it/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back to DRAFT" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not allowed");
    expect(alert).toHaveTextContent("Your role (EDITOR) cannot do this.");
  });

  it("explains a missing schedule time", async () => {
    const api = fakeApi({
      getContent: vi.fn(async () => record("READY")),
      transitionContent: vi.fn(async () => {
        throw callableError(
          "failed-precondition",
          "Scheduling needs a publish time in the future.",
          { reason: "SCHEDULE_REQUIRED" },
        );
      }),
    });
    renderEditor(api, "CONTENT_ADMIN", "hanuman-chalisa");
    await userEvent.click(await screen.findByRole("button", { name: "Schedule" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Schedule needed");
    expect(alert).toHaveTextContent("Scheduling needs a publish time in the future.");
  });

  it("blocks status moves while there are unsaved edits", async () => {
    renderEditor(fakeApi({ getContent: vi.fn(async () => record()) }), "EDITOR", "hanuman-chalisa");
    await userEvent.type(await screen.findByLabelText("Title in English"), "x");
    expect(screen.getByRole("button", { name: "Move to READY" })).toBeDisabled();
    expect(screen.getByText(/Save your changes before changing the status/)).toBeInTheDocument();
  });
});
