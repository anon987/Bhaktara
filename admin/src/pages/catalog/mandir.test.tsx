import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mandirOfferingInputSchema } from "../../../../src/domain/admin";
import { AdminProvider } from "../../app/context";
import type { CatalogKind } from "../../../../src/domain/admin";
import type { CatalogRow, PanelApi } from "../../panelApi";
import { fakeApi } from "../../test/fakeApi";
import { CatalogPage } from "./CatalogPage";
import { forbiddenFor, kindDefs, type OfferingForm } from "./kinds";
import { clampStage, dragStage, MIN_STAGE } from "./stage";

const art = (key: string) => ({ mobile: { key } });
const offering = (id: string, data: Record<string, unknown>): CatalogRow => ({
  id,
  updatedAt: null,
  data: { name: { en: id, hi: "हिंदी" }, deityIds: [], unlock: "FREE", sortOrder: 0, isActive: true, ...data },
});
const rows: CatalogRow[] = [
  offering("Bell brass", { kind: "bell", art: art("decor/b/mobile.1.webp"), sound: { audio: { key: "sound/s/file.0123abcd.m4a" } }, sortOrder: 10 }),
  offering("Marble temple", {
    kind: "temple",
    art: art("deity/t/mobile.1.webp"),
    stage: { x: 0.36, y: 0.47, width: 0.28, height: 0.27 },
    unlock: "REWARDED",
    sortOrder: 10,
  }),
  offering("Tulsi", { kind: "flower", flowerKind: "tulsi", deityIds: ["shiva"], art: art("deity/f/mobile.1.webp") }),
  offering("Fairy lights", { kind: "light", placement: "top", isActive: false }),
  offering("Rudraksha mala", {
    kind: "garland",
    offerAt: "neck",
    deityIds: ["shiva"],
    unlock: "REWARDED_SINGLE_USE",
    art: art("offering/g/mobile.1.webp"),
  }),
];

function renderPage() {
  const saveCatalogItem = vi.fn(async () => ({ id: "x" }));
  const panel = new Proxy(
    {
      listCatalog: vi.fn(async (kind: CatalogKind) =>
        kind === "mandirOffering"
          ? rows
          : [{ id: "shiva", updatedAt: null, data: { name: { en: "Shiva" }, murtiArt: art("deity/m/mobile.1.webp") } }],
      ),
      listAssets: vi.fn(async () => []),
      saveCatalogItem,
    } as unknown as PanelApi,
    {
      get: (target, name) =>
        (target as unknown as Record<string, unknown>)[name as string] ??
        (() => Promise.reject(new Error(`not stubbed: ${String(name)}`))),
    },
  );
  render(
    <AdminProvider api={fakeApi()} panel={panel} role="CONTENT_ADMIN">
      <CatalogPage kind="mandirOffering" />
    </AdminProvider>,
  );
  return { saveCatalogItem };
}

describe("Mandir offerings list", () => {
  it("groups by kind with the unlock, order and active badges, and filters by kind", async () => {
    const user = userEvent.setup();
    renderPage();
    const temples = await screen.findByRole("region", { name: "Temple" });
    expect(within(temples).getByText("Marble temple")).toBeInTheDocument();
    expect(within(temples).getByText("Ad · kept")).toBeInTheDocument();
    expect(within(temples).getByText("Order 10")).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Temple 1", "Lights 1", "Bell 1", "Flower 1", "Garland 1"]);
    expect(within(screen.getByRole("region", { name: "Lights" })).getByText("Hidden")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Bell" }));
    expect(screen.getByText("Bell brass")).toBeInTheDocument();
    expect(screen.queryByText("Marble temple")).not.toBeInTheDocument();
  });

  it("edits a temple's stage and unlock and sends only temple fields", async () => {
    const user = userEvent.setup();
    const { saveCatalogItem } = renderPage();
    await user.click(await screen.findByText("Marble temple"));
    expect(screen.getByRole("slider", { name: "Where the deity stands" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Unlock with one ad \(kept\)/ })).toBeChecked();
    expect(screen.queryByText("Bell sound")).not.toBeInTheDocument();

    // Arrow keys nudge the box by 1 %.
    screen.getByRole("slider", { name: "Where the deity stands" }).focus();
    await user.keyboard("{ArrowRight}");
    await user.click(screen.getByRole("radio", { name: /One ad per use/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCatalogItem).toHaveBeenCalled());
    const input = (saveCatalogItem.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0];
    expect(input.data).toMatchObject({ kind: "temple", unlock: "REWARDED_SINGLE_USE", stage: { x: 0.37, y: 0.47, width: 0.28, height: 0.27 } });
    expect(input.data).not.toHaveProperty("placement");
    expect(input.data).not.toHaveProperty("sound");
    expect(mandirOfferingInputSchema.safeParse(input.data).success).toBe(true);
  });

  it("places a special offering on the murti and sends offerAt", async () => {
    const user = userEvent.setup();
    const { saveCatalogItem } = renderPage();
    expect(await screen.findByText(/Neck \/ कंठ/)).toBeInTheDocument();
    await user.click(screen.getByText("Rudraksha mala"));
    const field = screen.getByRole("combobox", { name: "Where it is offered" });
    expect(field).toHaveTextContent("Neck / कंठ");
    expect(screen.getByTestId("offer-place-item")).toHaveAttribute("data-place", "neck");
    await user.click(field);
    await user.click(await screen.findByRole("option", { name: "Head / मस्तक" }));
    expect(screen.getByTestId("offer-place-item")).toHaveAttribute("data-place", "head");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCatalogItem).toHaveBeenCalled());
    const input = (saveCatalogItem.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0];
    expect(input.data).toMatchObject({ kind: "garland", offerAt: "head", deityIds: ["shiva"], unlock: "REWARDED_SINGLE_USE" });
    expect(mandirOfferingInputSchema.safeParse(input.data).success).toBe(true);
  });

  it("asks where it is offered only for special offerings", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText("Marble temple"));
    expect(screen.queryByRole("combobox", { name: "Where it is offered" })).not.toBeInTheDocument();
  });

  it("warns when a flower is forbidden for a chosen deity", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText("Tulsi"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tulsi must not be offered to Shiva");
  });
});

describe("offering form mapping", () => {
  const def = kindDefs.mandirOffering;
  it("keeps kind fields only for their kind", () => {
    const bell = def.fromDoc(rows[0].data) as OfferingForm;
    expect(bell.sound?.audio.key).toBe("sound/s/file.0123abcd.m4a");
    const asLight = def.toInput({ ...bell, kind: "light", placement: "sides" }) as Record<string, unknown>;
    expect(asLight).toMatchObject({ kind: "light", placement: "sides" });
    expect(asLight).not.toHaveProperty("sound");
    expect(def.toInput(bell)).toMatchObject({ kind: "bell", sound: { audio: { key: "sound/s/file.0123abcd.m4a" } } });
    const legacy = def.fromDoc({ name: { en: "Old", hi: "पुराना" }, kind: "diya", unlock: "SOMETHING" }) as OfferingForm;
    expect(legacy.unlock).toBe("FREE");
    expect(mandirOfferingInputSchema.safeParse(def.toInput(legacy)).success).toBe(true);
  });
  it("sends offerAt only for garland, ornament, diya, bhog and other", () => {
    const garland = def.fromDoc(rows[4].data) as OfferingForm;
    expect(garland.offerAt).toBe("neck");
    expect(def.toInput(garland)).toMatchObject({ kind: "garland", offerAt: "neck" });
    for (const kind of ["ornament", "diya", "bhog", "other"] as const)
      expect(def.toInput({ ...garland, kind })).toMatchObject({ kind, offerAt: "neck" });
    for (const kind of ["temple", "light", "bell", "flower"] as const)
      expect(def.toInput({ ...garland, kind })).not.toHaveProperty("offerAt");
    // Not chosen yet: left out (optional); an unknown stored place is dropped.
    expect(def.toInput({ ...garland, offerAt: "" })).not.toHaveProperty("offerAt");
    expect((def.fromDoc({ ...rows[4].data, offerAt: "waist" }) as OfferingForm).offerAt).toBe("");
  });
  it("finds forbidden deities for a flower", () => {
    expect(forbiddenFor("tulsi", ["krishna", "shiva", "ganesha"])).toEqual(["shiva", "ganesha"]);
    expect(forbiddenFor("durva", ["lakshmi"])).toEqual(["lakshmi"]);
    expect(forbiddenFor("", ["shiva"])).toEqual([]);
  });
});

describe("stage geometry", () => {
  const start = { x: 0.3, y: 0.4, width: 0.4, height: 0.4 };
  it("moves within the image", () => {
    expect(dragStage(start, "move", 0.1, -0.05)).toEqual({ x: 0.4, y: 0.35, width: 0.4, height: 0.4 });
    expect(dragStage(start, "move", 1, 1)).toEqual({ x: 0.6, y: 0.6, width: 0.4, height: 0.4 });
    expect(dragStage(start, "move", -1, -1)).toEqual({ x: 0, y: 0, width: 0.4, height: 0.4 });
  });
  it("resizes from a corner, keeping a minimum size and the image bounds", () => {
    expect(dragStage(start, "se", 0.1, 0.1)).toEqual({ x: 0.3, y: 0.4, width: 0.5, height: 0.5 });
    expect(dragStage(start, "nw", 0.1, 0.1)).toEqual({ x: 0.4, y: 0.5, width: 0.3, height: 0.3 });
    expect(dragStage(start, "ne", 1, -1)).toEqual({ x: 0.3, y: 0, width: 0.7, height: 0.8 });
    expect(dragStage(start, "sw", 1, 0).width).toBeCloseTo(MIN_STAGE);
  });
  it("clamps typed values into the image", () => {
    expect(clampStage({ x: 0.9, y: 0.2, width: 0.4, height: 0.01 })).toEqual({ x: 0.6, y: 0.2, width: 0.4, height: MIN_STAGE });
  });
});
