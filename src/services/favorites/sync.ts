import { z } from "zod";
import { ContentType } from "../../domain/models";
import { FavoritesRepository } from "../../repositories/contracts";
import { favoriteIdSchema } from "../../repositories/favoritesRepository";
import {
  codedError,
  isPermanentError,
} from "../../repositories/firestoreErrors";
import {
  FavoritesSyncState,
  FavoritesSyncStore,
  initialFavoritesSyncState,
  PendingFavoriteWrite,
} from "./syncStore";

type Op = PendingFavoriteWrite["op"];
export type FavoritesSyncOptions = {
  repository: FavoritesRepository;
  store: FavoritesSyncStore;
  // Updates the device cache (LocalState.favorites), newest first.
  apply(update: (ids: string[]) => string[]): void;
  // `waiting`: the last write could not reach the server (offline); the
  // pending changes are kept and retried.
  onPendingChange?(status: { pending: number; waiting: boolean }): void;
  writeTimeoutMs?: number;
  retryDelayMs?(attempts: number): number;
  // Upper bound on favorites mirrored into the device cache per refresh.
  maxItems?: number;
  minRefreshIntervalMs?: number;
  now?(): number;
};
export type FavoritesSync = ReturnType<typeof createFavoritesSync>;

const defaultRetryDelay = (attempts: number) =>
  Math.min(2000 * 2 ** Math.max(0, attempts - 1), 5 * 60_000);

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(codedError("deadline-exceeded", "Write timed out")),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

// Account favorites sync. The UI updates the device cache optimistically and
// hands each change to `setFavorite`, which records it in a durable queue
// (coalesced per item, latest change wins) before sending it. Writes are
// idempotent (doc ID = content ID), so a queue replayed after a crash or a
// timed-out write that did reach the server is harmless. Transient failures
// back off and retry; rule rejections (draft or unknown content) drop the item
// from the cache. The first session of each account receives the device's
// existing favorites once; refresh() then mirrors the account list into the
// cache with still-pending changes applied on top.
export function createFavoritesSync({
  repository,
  store,
  apply,
  onPendingChange,
  writeTimeoutMs = 20_000,
  retryDelayMs = defaultRetryDelay,
  maxItems = 1000,
  minRefreshIntervalMs = 60_000,
  now = Date.now,
}: FavoritesSyncOptions) {
  let state: FavoritesSyncState = initialFavoritesSyncState;
  let started = false;
  let stopped = false;
  let saving: Promise<void> = Promise.resolve();
  let flushing: Promise<void> | null = null;
  let pulling: Promise<void> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPull = -Infinity;
  // Changes made before start() finished loading the stored queue.
  const early: [string, Op, ContentType | undefined][] = [];
  // Writes confirmed while a refresh is reading pages it may have missed.
  let confirmedDuringPull: Map<string, Op> | null = null;

  let waiting = false;
  const notify = () =>
    onPendingChange?.({
      pending: state.queue.length,
      waiting: waiting && state.queue.length > 0,
    });
  function persist() {
    // A stopped engine must not overwrite the queue of its replacement.
    if (stopped) return saving;
    const snapshot = state;
    saving = saving.catch(() => undefined).then(() => store.write(snapshot));
    return saving;
  }
  function enqueue(contentId: string, op: Op, type?: ContentType) {
    const seq = state.seq + 1;
    state = {
      ...state,
      seq,
      queue: [
        ...state.queue.filter((entry) => entry.contentId !== contentId),
        {
          contentId,
          op,
          ...(op === "add" && type ? { type } : {}),
          seq,
          attempts: 0,
        },
      ],
    };
  }
  function settle(entry: PendingFavoriteWrite, accepted: boolean) {
    // Either way the server answered.
    waiting = false;
    if (accepted) confirmedDuringPull?.set(entry.contentId, entry.op);
    const current = state.queue.find(
      (value) => value.contentId === entry.contentId,
    );
    // A newer change to the same item is still pending and decides the outcome.
    if (current?.seq !== entry.seq) return notify();
    state = {
      ...state,
      queue: state.queue.filter((value) => value !== current),
    };
    if (!accepted && entry.op === "add") {
      // Draft, unpublished or unknown content cannot be a favorite.
      confirmedDuringPull?.set(entry.contentId, "remove");
      apply((ids) => ids.filter((id) => id !== entry.contentId));
    }
    void persist().catch(() => undefined);
    notify();
  }
  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }
  async function drain() {
    while (!stopped) {
      const entry = state.queue[0];
      if (!entry) return;
      try {
        await withTimeout(
          entry.op === "add"
            ? repository.add(entry.contentId, entry.type)
            : repository.remove(entry.contentId),
          writeTimeoutMs,
        );
        if (stopped) return;
        settle(entry, true);
      } catch (error) {
        if (stopped) return;
        if (isPermanentError(error) || error instanceof z.ZodError) {
          settle(entry, false);
          continue;
        }
        const attempts = entry.attempts + 1;
        state = {
          ...state,
          queue: state.queue.map((value) =>
            value.seq === entry.seq ? { ...value, attempts } : value,
          ),
        };
        void persist().catch(() => undefined);
        waiting = true;
        notify();
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void flush();
        }, retryDelayMs(attempts));
        return;
      }
    }
  }
  function flush(): Promise<void> {
    if (!started || stopped) return Promise.resolve();
    clearRetry();
    flushing ??= drain().finally(() => {
      flushing = null;
      // A change queued as the loop finished still needs sending.
      if (!stopped && !retryTimer && state.queue.length) void flush();
    });
    return flushing;
  }
  async function pull() {
    confirmedDuringPull = new Map();
    try {
      const ids = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await repository.list({ limit: 50, cursor });
        page.items.forEach((item) => ids.add(item.contentId));
        cursor = page.nextCursor;
      } while (cursor && ids.size < maxItems && !stopped);
      if (stopped) return;
      // Confirmed writes the pages may predate, then still-pending changes.
      const changes = new Map(confirmedDuringPull);
      for (const entry of state.queue) {
        changes.delete(entry.contentId);
        changes.set(entry.contentId, entry.op);
      }
      let merged = [...ids].slice(0, maxItems);
      for (const [id, op] of changes)
        merged =
          op === "add"
            ? [id, ...merged.filter((value) => value !== id)]
            : merged.filter((value) => value !== id);
      apply(() => merged);
      lastPull = now();
    } finally {
      confirmedDuringPull = null;
    }
  }
  function refresh({ force = false } = {}): Promise<void> {
    if (!started || stopped) return Promise.resolve();
    if (!force && now() - lastPull < minRefreshIntervalMs)
      return Promise.resolve();
    pulling ??= pull().finally(() => {
      pulling = null;
    });
    return pulling;
  }
  return {
    // `deviceFavorites` is the cache as hydrated from device storage. Rejects
    // only if the stored queue cannot be read.
    async start(uid: string, deviceFavorites: string[]) {
      const stored = await store.read();
      if (stopped) return;
      // Writes may only target the caller's own list; a queue left by another
      // account cannot be sent (account merge is server-side, D-017).
      state = stored.uid === uid ? stored : { ...stored, uid, queue: [] };
      if (!state.migrated.includes(uid)) {
        const valid = deviceFavorites.filter(
          (id) => favoriteIdSchema.safeParse(id).success,
        );
        if (valid.length !== deviceFavorites.length)
          apply((ids) => ids.filter((id) => valid.includes(id)));
        // Oldest first, so the newest device favorite gets the newest time.
        for (const id of valid)
          if (!state.queue.some((entry) => entry.contentId === id))
            enqueue(id, "add");
        state = { ...state, migrated: [...state.migrated, uid] };
      }
      for (const [id, op, type] of early.splice(0)) enqueue(id, op, type);
      started = true;
      // The migration mark and its queued writes are stored together.
      await persist().catch(() => undefined);
      notify();
      await flush();
      await refresh({ force: true }).catch(() => undefined);
    },
    // Resolves once the change is stored on the device, not when it is sent.
    setFavorite(contentId: string, favorite: boolean, type?: ContentType) {
      if (stopped || !favoriteIdSchema.safeParse(contentId).success)
        return Promise.resolve();
      const op: Op = favorite ? "add" : "remove";
      if (!started) {
        early.push([contentId, op, type]);
        return Promise.resolve();
      }
      enqueue(contentId, op, type);
      notify();
      const saved = persist();
      void flush();
      return saved;
    },
    flush,
    refresh,
    pending: () => state.queue.length,
    stop() {
      stopped = true;
      clearRetry();
    },
  };
}
