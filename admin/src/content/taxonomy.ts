import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../app/context";
import { can } from "../domain";
import { readableError } from "../errors";
import { slugify } from "./draftForm";
import type { CreateInput, MultiOption } from "../components/panel/CreatableMultiSelect";

// Options for the editor's deity, category and tag pickers, plus the
// "create new" calls. Deities and categories are catalogue documents written
// through saveCatalogItem (the same path as the Deities and Categories pages);
// tags are free text on the content item.

type Named = { name?: { en?: string; hi?: string }; sortOrder?: number };

const toOptions = (rows: { id: string; data: Named }[]): MultiOption[] =>
  rows
    .sort(
      (a, b) =>
        (a.data.sortOrder ?? 0) - (b.data.sortOrder ?? 0) ||
        (a.data.name?.en ?? a.id).localeCompare(b.data.name?.en ?? b.id),
    )
    .map((row) => ({
      value: row.id,
      label: row.data.name?.en || row.id,
      hint: row.data.name?.hi || undefined,
    }));

function useOptions(load: () => Promise<MultiOption[]>) {
  const [options, setOptions] = useState<MultiOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    load()
      .then((rows) => active && setOptions(rows))
      .catch((caught) => active && setError(readableError(caught).message));
    return () => {
      active = false;
    };
  }, [load]);
  const add = useCallback(
    (option: MultiOption) =>
      setOptions((current) =>
        current.some((item) => item.value === option.value) ? current : [...current, option],
      ),
    [],
  );
  return { options, error, add };
}

// The catalogue's two names; Hindi falls back to English (both are required)
// until someone fills it in on the catalogue page.
const names = (input: CreateInput) => {
  const en = input.label.trim();
  if (!en) throw new Error("Enter the English name.");
  if (en.length > 60) throw new Error("Names can be at most 60 characters.");
  return { en, hi: input.hindi.trim() || en };
};

// A readable ID from the English name; left to the server when taken.
const idFor = (en: string, taken: readonly MultiOption[]) => {
  const slug = slugify(en);
  return slug && !taken.some((option) => option.value === slug) ? { id: slug } : {};
};

export function useDeityPicker() {
  const { api, panel, role } = useAdmin();
  // Every deity (also the inactive ones the catalogue just created); the
  // public active-only list is the fallback.
  const load = useCallback(
    () =>
      panel
        .listCatalog<Named>("deity")
        .then(toOptions)
        .catch(async () =>
          (await api.listDeities()).map((deity) => ({
            value: deity.id,
            label: deity.name.en || deity.id,
            hint: deity.name.hi || undefined,
          })),
        ),
    [api, panel],
  );
  const { options, error, add } = useOptions(load);
  const create = async (input: CreateInput): Promise<MultiOption> => {
    const name = names(input);
    try {
      const { id } = await panel.saveCatalogItem({
        kind: "deity",
        ...idFor(name.en, options),
        create: true,
        // Inactive until it has Mandir art (the server refuses an active
        // deity without it); content can use it right away.
        data: {
          name,
          description: { hi: "", en: "" },
          aliases: [],
          isActive: false,
          isMandirEnabled: false,
          sortOrder: 0,
        },
      });
      const option = { value: id, label: name.en, hint: input.hindi.trim() || undefined };
      add(option);
      return option;
    } catch (caught) {
      throw new Error(readableError(caught).message);
    }
  };
  return { options, error, create: can(role, "catalog.write") ? create : undefined };
}

export function useCategoryPicker() {
  const { panel, role } = useAdmin();
  const load = useCallback(() => panel.listCatalog<Named>("category").then(toOptions), [panel]);
  const { options, error, add } = useOptions(load);
  const create = async (input: CreateInput): Promise<MultiOption> => {
    const name = names(input);
    try {
      const { id } = await panel.saveCatalogItem({
        kind: "category",
        ...idFor(name.en, options),
        create: true,
        // No content types: offered for every type.
        data: { name, description: { hi: "", en: "" }, contentTypes: [], isActive: true, sortOrder: 0 },
      });
      const option = { value: id, label: name.en, hint: input.hindi.trim() || undefined };
      add(option);
      return option;
    } catch (caught) {
      throw new Error(readableError(caught).message);
    }
  };
  return { options, error, create: can(role, "catalog.write") ? create : undefined };
}

export function useTagPicker() {
  const { panel } = useAdmin();
  const load = useCallback(
    () =>
      panel
        .listContentTags()
        .then((tags) => tags.map((tag) => ({ value: tag, label: tag })))
        // Suggestions only: typing a new tag always works.
        .catch(() => [] as MultiOption[]),
    [panel],
  );
  const { options, add } = useOptions(load);
  const create = async ({ label }: CreateInput): Promise<MultiOption> => {
    const tag = label.trim();
    if (tag.length > 60) throw new Error("Tags can be at most 60 characters.");
    const option = { value: tag, label: tag };
    add(option);
    return option;
  };
  return { options, create };
}
