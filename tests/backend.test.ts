import { createSessionService } from "../src/services/auth/session";
import { parseBackendConfig } from "../src/services/backend/config";
import { buildSearchTokens, searchWords } from "../src/domain/search";
import { publishedContentSchema } from "../src/repositories/firestoreSchemas";
import { fixtures } from "../src/repositories/fixtures";

test("auth waits for persisted identity and deduplicates concurrent startup", async () => {
  let restore!: () => void;
  const user = { uid: "existing-guest", isAnonymous: true };
  const driver = {
    ready: () =>
      new Promise<void>((resolve) => {
        restore = resolve;
      }),
    current: jest.fn(() => user),
    createAnonymous: jest.fn(async () => user),
  };
  const service = createSessionService(driver);
  const first = service.ensureSession();
  const second = service.ensureSession();
  expect(driver.current).not.toHaveBeenCalled();
  restore();
  expect(await first).toEqual(user);
  expect(await second).toEqual(user);
  expect(driver.createAnonymous).not.toHaveBeenCalled();
});
test("anonymous creation is single-flight and failed auth can be retried", async () => {
  const user = { uid: "new-guest", isAnonymous: true };
  const driver = {
    ready: async () => {},
    current: () => null,
    createAnonymous: jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(user),
  };
  const service = createSessionService(driver);
  const first = service.ensureSession();
  expect(service.ensureSession()).toBe(first);
  await expect(first).rejects.toThrow("offline");
  expect(await service.ensureSession()).toEqual(user);
  expect(driver.createAnonymous).toHaveBeenCalledTimes(2);
});
test("emulator config cannot silently connect to cloud services", () => {
  expect(parseBackendConfig()).toEqual({ mode: "fixture" });
  expect(parseBackendConfig("emulator")).toMatchObject({
    projectId: "demo-bhaktara",
    host: "127.0.0.1",
  });
  expect(() => parseBackendConfig("production")).toThrow();
  expect(() => parseBackendConfig("emulator", "cloud.example.com")).toThrow();
});
test("publisher and query share Hindi and transliteration normalization", () => {
  const tokens = buildSearchTokens([
    "Hanumaan",
    "हनुमान",
    "Shiva aarti",
    "शिव आरती",
  ]);
  expect(searchWords("HANUMAAN!!")).toEqual(["hanuman"]);
  expect(tokens).toContain("han");
  expect(tokens).toContain("हनुमान");
  expect(tokens).toContain(searchWords("shiva")[0]);
  expect(
    buildSearchTokens(
      Array.from({ length: 300 }, (_, index) => `word${index}`),
    ),
  ).toHaveLength(200);
});
test("catalog schema rejects drafts and media URLs", () => {
  const item = {
    ...fixtures.content[0],
    status: "PUBLISHED",
    popularityScore: 1,
  };
  expect(publishedContentSchema.safeParse(item).success).toBe(true);
  expect(
    publishedContentSchema.safeParse({ ...item, status: "DRAFT" }).success,
  ).toBe(false);
  expect(
    publishedContentSchema.safeParse({
      ...item,
      media: { thumb: { key: "https://example.com/image" } },
    }).success,
  ).toBe(false);
});
