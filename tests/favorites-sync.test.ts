import { FavoritesRepository } from "../src/repositories/contracts";
import { codedError } from "../src/repositories/firestoreErrors";
import { createFavoritesSync } from "../src/services/favorites/sync";
import {
  FavoritesSyncState,
  FavoritesSyncStore,
  favoritesSyncStateSchema,
  initialFavoritesSyncState,
} from "../src/services/favorites/syncStore";

// Device storage that survives "restarts" (new engines) within a test.
function memoryStore(initial = initialFavoritesSyncState) {
  let saved: string = JSON.stringify(initial);
  const store: FavoritesSyncStore & { current(): FavoritesSyncState } = {
    read: jest.fn(async () =>
      favoritesSyncStateSchema.parse(JSON.parse(saved)),
    ),
    write: jest.fn(async (state: FavoritesSyncState) => {
      saved = JSON.stringify(state);
    }),
    current: () => favoritesSyncStateSchema.parse(JSON.parse(saved)),
  };
  return store;
}

// An account list kept in memory; `offline` makes every call fail transiently.
function fakeAccount(options: { published?: string[] } = {}) {
  const published = new Set(
    options.published ?? ["a", "b", "c", "x", "y", "z"],
  );
  const docs: string[] = []; // newest first
  let offline = false;
  const calls: string[] = [];
  const guard = () => {
    if (offline) throw codedError("unavailable", "offline");
  };
  const repository: FavoritesRepository = {
    kind: "account",
    add: jest.fn(async (id: string) => {
      calls.push(`add:${id}`);
      guard();
      if (!published.has(id))
        throw codedError("permission-denied", "not published");
      if (!docs.includes(id)) docs.unshift(id);
    }),
    remove: jest.fn(async (id: string) => {
      calls.push(`remove:${id}`);
      guard();
      const index = docs.indexOf(id);
      if (index >= 0) docs.splice(index, 1);
    }),
    list: jest.fn(async ({ limit = 20, cursor } = {}) => {
      guard();
      const start = cursor ? Number(cursor) : 0;
      const items = docs.slice(start, start + limit).map((contentId) => ({
        contentId,
        type: "BHAJAN" as const,
        createdAtMs: 0,
      }));
      return {
        items,
        nextCursor:
          start + limit < docs.length ? String(start + limit) : undefined,
      };
    }),
  };
  return {
    repository,
    docs,
    calls,
    setOffline: (value: boolean) => {
      offline = value;
    },
  };
}

function cache(initial: string[] = []) {
  let ids = initial;
  return {
    apply: (update: (current: string[]) => string[]) => {
      ids = update(ids);
    },
    get: () => ids,
  };
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

test("first session migrates device favorites once, dropping unknown IDs", async () => {
  const store = memoryStore();
  const account = fakeAccount();
  const device = cache(["a", "unknown", "b"]);
  const sync = createFavoritesSync({
    repository: account.repository,
    store,
    apply: device.apply,
  });
  await sync.start("guest-1", device.get());
  // Oldest device favorite first, so the newest ends up first in the account.
  expect(account.calls).toEqual(["add:a", "add:unknown", "add:b"]);
  expect(account.docs).toEqual(["b", "a"]);
  expect(device.get()).toEqual(["b", "a"]);
  expect(store.current()).toMatchObject({
    uid: "guest-1",
    migrated: ["guest-1"],
    queue: [],
  });
  sync.stop();

  // A later launch (even with a stale device list) does not migrate again.
  const again = createFavoritesSync({
    repository: account.repository,
    store,
    apply: device.apply,
  });
  await again.start("guest-1", ["a", "c"]);
  expect(account.calls).toHaveLength(3);
  expect(device.get()).toEqual(["b", "a"]);
  again.stop();
});

test("pending writes persist across restarts and retry with backoff", async () => {
  const store = memoryStore({ ...initialFavoritesSyncState, migrated: ["u"] });
  const account = fakeAccount();
  account.setOffline(true);
  const retryDelayMs = jest.fn(() => 5);
  const statuses: { pending: number; waiting: boolean }[] = [];
  const first = createFavoritesSync({
    repository: account.repository,
    store,
    apply: () => undefined,
    retryDelayMs,
    onPendingChange: (status) => statuses.push(status),
  });
  await first.start("u", []);
  await first.setFavorite("a", true, "BHAJAN");
  await flushPromises();
  expect(store.current().queue).toMatchObject([
    { contentId: "a", op: "add", type: "BHAJAN", attempts: 1 },
  ]);
  expect(statuses.at(-1)).toEqual({ pending: 1, waiting: true });
  // The backoff timer retries on its own.
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(retryDelayMs).toHaveBeenCalledWith(2);
  expect(store.current().queue[0].attempts).toBeGreaterThanOrEqual(2);
  first.stop(); // app killed while offline

  account.setOffline(false);
  const second = createFavoritesSync({
    repository: account.repository,
    store,
    apply: () => undefined,
  });
  await second.start("u", []);
  expect(account.docs).toEqual(["a"]);
  expect(store.current().queue).toEqual([]);
  second.stop();
});

test("changes to one item coalesce; the latest change wins", async () => {
  const store = memoryStore({ ...initialFavoritesSyncState, migrated: ["u"] });
  const account = fakeAccount();
  account.docs.push("x");
  const device = cache(["x"]);
  const sync = createFavoritesSync({
    repository: account.repository,
    store,
    apply: device.apply,
    retryDelayMs: () => 60_000,
  });
  account.setOffline(true);
  await sync.start("u", device.get());
  await sync.setFavorite("a", true);
  await sync.setFavorite("x", false);
  await sync.setFavorite("a", false);
  await sync.setFavorite("a", true);
  await flushPromises();
  expect(
    store.current().queue.map((entry) => entry.op + entry.contentId),
  ).toEqual(["removex", "adda"]);
  account.setOffline(false);
  await sync.flush();
  expect(account.docs).toEqual(["a"]);
  expect(sync.pending()).toBe(0);
  sync.stop();
});

test("a change made while its write is in flight is still sent", async () => {
  const store = memoryStore({ ...initialFavoritesSyncState, migrated: ["u"] });
  const account = fakeAccount();
  let release!: () => void;
  const base = account.repository.add;
  account.repository.add = jest.fn(async (id: string) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return base(id);
  });
  const sync = createFavoritesSync({
    repository: account.repository,
    store,
    apply: () => undefined,
  });
  await sync.start("u", []);
  void sync.setFavorite("a", true);
  await flushPromises();
  await sync.setFavorite("a", false);
  release();
  await flushPromises();
  await sync.flush();
  expect(account.calls).toEqual(["add:a", "remove:a"]);
  expect(account.docs).toEqual([]);
  expect(store.current().queue).toEqual([]);
  sync.stop();
});

test("rejected favorites leave the cache; timeouts are retried", async () => {
  const store = memoryStore({ ...initialFavoritesSyncState, migrated: ["u"] });
  const account = fakeAccount({ published: ["a"] });
  account.docs.push("a");
  const device = cache(["a"]);
  account.repository.add = jest
    .fn()
    .mockImplementationOnce(() => new Promise(() => undefined))
    .mockRejectedValueOnce(codedError("firestore/permission-denied", "draft"));
  const sync = createFavoritesSync({
    repository: account.repository,
    store,
    apply: device.apply,
    writeTimeoutMs: 5,
    retryDelayMs: () => 60_000,
  });
  await sync.start("u", device.get());
  // The UI updates the cache optimistically before handing over the change.
  device.apply((ids) => ["draft", ...ids]);
  await sync.setFavorite("draft", true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(store.current().queue).toMatchObject([
    { contentId: "draft", attempts: 1 },
  ]);
  await sync.flush();
  expect(store.current().queue).toEqual([]);
  expect(device.get()).toEqual(["a"]);
  sync.stop();
});

test("refresh mirrors the account list newest first with pending changes on top", async () => {
  const store = memoryStore({ ...initialFavoritesSyncState, migrated: ["u"] });
  const account = fakeAccount();
  account.docs.push(...["y", "x", "c", "b"]);
  const device = cache(["stale"]);
  const sync = createFavoritesSync({
    repository: account.repository,
    store,
    apply: device.apply,
    retryDelayMs: () => 60_000,
  });
  await sync.start("u", device.get());
  expect(device.get()).toEqual(["y", "x", "c", "b"]);
  account.setOffline(true);
  await sync.setFavorite("z", true);
  await sync.setFavorite("c", false);
  await flushPromises();
  account.setOffline(false);
  // Read pages only: pending writes are still unsent.
  account.repository.add = jest.fn(() => new Promise<void>(() => undefined));
  account.repository.remove = jest.fn(() => new Promise<void>(() => undefined));
  await sync.refresh({ force: true });
  expect(device.get()).toEqual(["z", "y", "x", "b"]);
  // Unforced refreshes are throttled.
  await sync.refresh();
  expect(account.repository.list).toHaveBeenCalledTimes(2);
  sync.stop();
});

test("a queue left by another account is not sent to this one", async () => {
  const store = memoryStore({
    uid: "old",
    migrated: ["old"],
    seq: 1,
    queue: [{ contentId: "a", op: "add", seq: 1, attempts: 2 }],
  });
  const account = fakeAccount();
  const sync = createFavoritesSync({
    repository: account.repository,
    store,
    apply: () => undefined,
  });
  await sync.start("new", []);
  expect(account.calls).toEqual([]);
  expect(store.current()).toMatchObject({
    uid: "new",
    migrated: ["old", "new"],
    queue: [],
  });
  sync.stop();
});
