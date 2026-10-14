import { vi } from "vitest";
import type { AdminApi, LocalizeInput } from "../api";
import type { BulkContentInput } from "../domain";

// A fully stubbed AdminApi; tests override the calls they care about.
export function fakeApi(overrides: Partial<AdminApi> = {}): AdminApi {
  return {
    listContent: vi.fn(async () => ({ items: [], next: null })),
    getContent: vi.fn(async () => null),
    listDeities: vi.fn(async () => [
      { id: "hanuman", name: { en: "Hanuman", hi: "हनुमान" } },
      { id: "shiva", name: { en: "Shiva", hi: "शिव" } },
    ]),
    createContent: vi.fn(async (id: string) => ({ id, status: "DRAFT" as const, problems: [] })),
    updateContent: vi.fn(async (id: string) => ({ id, status: "DRAFT" as const, problems: [] })),
    transitionContent: vi.fn(async (input) => ({
      id: input.contentId,
      from: "DRAFT" as const,
      to: input.to,
    })),
    bulkContent: vi.fn(async (input: BulkContentInput) => ({
      results: input.ids.map((id) => ({ id, ok: true })),
    })),
    listBanners: vi.fn(async () => []),
    createBanner: vi.fn(async () => ({ id: "b1" })),
    updateBanner: vi.fn(async (id: string) => ({ id })),
    deleteBanner: vi.fn(async (id: string) => ({ id })),
    listAudit: vi.fn(async () => ({ items: [], next: null })),
    requestUploadUrl: vi.fn(async () => {
      throw new Error("not stubbed");
    }),
    putFile: vi.fn(async () => {}),
    // Devanagari in → Hinglish "en"; anything else → Devanagari "hi".
    localizeText: vi.fn(async ({ items }: LocalizeInput) =>
      items.map((text) =>
        /[ऀ-ॿ]/.test(text)
          ? { language: "hi" as const, hi: text, en: `Hinglish ${text.length}` }
          : { language: "en" as const, en: text, hi: `हिन्दी ${text}` },
      ),
    ),
    ...overrides,
  };
}

// The shape firebase/functions gives a rejected callable.
export const callableError = (code: string, message: string, details?: unknown) =>
  Object.assign(new Error(message), { code: `functions/${code}`, details });
