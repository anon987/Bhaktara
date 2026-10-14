import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { Catalog, CatalogMode, Content } from "../../domain/models";
import {
  initialState,
  LocalState,
  localStore,
} from "../../services/storage/localStore";
import { localPracticeDay, remainingAt } from "../../domain/practice";
import { Backend, getBackend } from "../../services/backend";
import { ContentQuery, ContentRepository } from "../../repositories/contracts";
import { DecorItem } from "../../domain/mandirDecor";
import { ProgressionRepository } from "../../repositories/progressionRepository";
import { Language, StringKey, translate } from "../../i18n/strings";
import { analytics } from "../../services/analytics";
import { remoteConfig } from "../../services/remoteConfig";
import { GuestSession } from "../../services/auth/session";
import {
  createFavoritesSync,
  FavoritesSync,
} from "../../services/favorites/sync";
import {
  FavoritesSyncStore,
  favoritesSyncStore,
} from "../../services/favorites/syncStore";
export type FavoritesStatus = {
  // "account": favorites are saved to the session's account and device
  // storage is the cache; "device": fixture mode, device storage only.
  source: "account" | "device";
  // Changes saved on this device that have not reached the account yet.
  pending: number;
  // The last write could not reach the server; pending changes will retry.
  waiting: boolean;
};
type AppContextValue = {
  local: LocalState;
  ready: boolean;
  storageError: boolean;
  catalog: Catalog | null;
  catalogMode: CatalogMode;
  t: (key: StringKey) => string;
  setLanguage: (language: Language) => void;
  update: (fn: (state: LocalState) => LocalState) => void;
  retry: () => void;
  retryStorage: () => void;
  connection: "loading" | "fixture" | "emulator" | "cloud" | "error";
  searchContent: ContentRepository["search"];
  getContent: ContentRepository["getById"];
  getHome: ContentRepository["getHome"];
  // Published mandir decor; empty before the backend is ready, when the
  // repository has none or the read fails (the bundled set is then used).
  getMandirDecor: () => Promise<DecorItem[]>;
  setCatalogMode: (mode: CatalogMode) => void;
  toggleFavorite: (id: string) => void;
  favoritesStatus: FavoritesStatus;
  // Re-reads the account list into the cache (throttled unless forced).
  refreshFavorites: (options?: { force?: boolean }) => Promise<void>;
  completeTask: (task: "jaap" | "meditation" | "prayer", at?: Date) => void;
  // Server practice (null in fixture mode or before the backend is ready).
  progression: ProgressionRepository | null;
  session: GuestSession | null;
};
const Context = createContext<AppContextValue | null>(null);
export function AppProvider({
  children,
  loadBackend = getBackend,
  favoritesStore = favoritesSyncStore,
}: React.PropsWithChildren<{
  loadBackend?: () => Promise<Backend>;
  favoritesStore?: FavoritesSyncStore;
}>) {
  const [local, setLocal] = useState(initialState);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [storageAttempt, setStorageAttempt] = useState(0);
  const retryStorage = useCallback(() => {
    setStorageError(false);
    setStorageAttempt((attempt) => attempt + 1);
  }, []);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogMode, setCatalogMode] = useState<CatalogMode>("loading");
  const [backend, setBackend] = useState<Backend | null>(null);
  const [session, setSession] = useState<GuestSession | null>(null);
  const [connection, setConnection] =
    useState<AppContextValue["connection"]>("loading");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    void remoteConfig.start();
  }, []);
  const retry = useCallback(() => {
    setCatalogMode("loading");
    setConnection("loading");
    setCatalogAttempt((attempt) => attempt + 1);
  }, []);
  useEffect(() => {
    let active = true;
    localStore
      .read()
      .then((data) => {
        if (active) {
          setLocal(data);
          setStorageError(false);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setStorageError(true);
      });
    return () => {
      active = false;
    };
  }, [storageAttempt]);
  useEffect(() => {
    let active = true;
    loadBackend()
      .then(async (services) => {
        const current = await services.session.ensureSession();
        const data = await services.content.getCatalog();
        if (active) {
          setBackend(services);
          setSession(current);
          setConnection(services.mode);
          setCatalog(data);
          setCatalogMode("ready");
        }
      })
      .catch(() => {
        if (active) {
          setConnection("error");
          setCatalogMode("error");
        }
      });
    return () => {
      active = false;
    };
  }, [catalogAttempt, loadBackend]);
  const cacheContent = useCallback((items: Content[]) => {
    setCatalog(
      (current) =>
        current && {
          ...current,
          content: [
            ...current.content.map(
              (item) => items.find((next) => next.id === item.id) ?? item,
            ),
            ...items.filter(
              (item) => !current.content.some((old) => old.id === item.id),
            ),
          ],
        },
    );
  }, []);
  const searchContent = useCallback(
    async (input: ContentQuery) => {
      if (!backend) throw new Error("Backend is not ready");
      const result = await backend.content.search(input);
      cacheContent(result.items);
      return result;
    },
    [backend, cacheContent],
  );
  const getContent = useCallback(
    async (id: string) => {
      if (!backend) throw new Error("Backend is not ready");
      const item = await backend.content.getById(id);
      if (item) cacheContent([item]);
      return item;
    },
    [backend, cacheContent],
  );
  const getHome = useCallback<ContentRepository["getHome"]>(
    async (language) => {
      if (!backend) throw new Error("Backend is not ready");
      return backend.content.getHome(language);
    },
    [backend],
  );
  const getMandirDecor = useCallback(async (): Promise<DecorItem[]> => {
    const content = backend?.content;
    if (!content?.getMandirDecor) return [];
    return content.getMandirDecor().catch(() => []);
  }, [backend]);
  useEffect(() => {
    if (!ready) return;
    const handle = setTimeout(() => {
      writes.current = writes.current
        .catch(() => undefined)
        .then(() => localStore.write(local))
        .then(() => setStorageError(false))
        .catch(() => setStorageError(true));
    }, 120);
    return () => clearTimeout(handle);
  }, [local, ready]);
  const localRef = useRef(local);
  useEffect(() => {
    localRef.current = local;
  }, [local]);
  // Latest favorites, updated synchronously so rapid taps toggle correctly.
  const favoritesRef = useRef(local.favorites);
  useEffect(() => {
    favoritesRef.current = local.favorites;
  }, [local.favorites]);
  const [sync, setSync] = useState<FavoritesSync | null>(null);
  // Toggles made before account sync started (backend still loading).
  const unsynced = useRef(new Map<string, boolean>());
  const [pendingFavorites, setPendingFavorites] = useState({
    pending: 0,
    waiting: false,
  });
  const accountFavorites =
    backend?.favorites?.kind === "account" && session
      ? backend.favorites
      : null;
  useEffect(() => {
    if (!ready || !accountFavorites || !session) return;
    const engine = createFavoritesSync({
      repository: accountFavorites,
      store: favoritesStore,
      apply: (fn) => {
        favoritesRef.current = fn(favoritesRef.current);
        setLocal((state) => ({ ...state, favorites: fn(state.favorites) }));
      },
      onPendingChange: setPendingFavorites,
    });
    setSync(engine);
    // Held until start() has loaded the stored queue.
    for (const [id, favorite] of unsynced.current)
      void engine.setFavorite(id, favorite);
    unsynced.current.clear();
    // Declared after the localRef effect, so this is the hydrated list.
    engine.start(session.uid, localRef.current.favorites).catch(() => {
      // The stored queue could not be read; the device cache stays usable
      // and the next backend retry starts sync again.
    });
    const listener = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void engine.flush();
        void engine.refresh().catch(() => undefined);
      }
    });
    return () => {
      listener.remove();
      engine.stop();
      setSync(null);
    };
  }, [ready, accountFavorites, session, favoritesStore]);
  const refreshFavorites = useCallback(
    async (options?: { force?: boolean }) => {
      await sync?.refresh(options);
    },
    [sync],
  );
  useEffect(() => {
    if (!ready) return;
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active")
        writes.current = writes.current
          .catch(() => undefined)
          .then(() => localStore.write(localRef.current))
          .catch(() => setStorageError(true));
    });
    return () => listener.remove();
  }, [ready]);
  const completeTask = useCallback(
    (task: "jaap" | "meditation" | "prayer", at?: Date) =>
      setLocal((state) => {
        const day = localPracticeDay(at);
        if (state.days[day]?.[task]) return state;
        return {
          ...state,
          days: {
            ...state.days,
            [day]: {
              ...(state.days[day] ?? {
                jaap: false,
                meditation: false,
                prayer: false,
              }),
              [task]: true,
            },
          },
        };
      }),
    [],
  );
  useEffect(() => {
    const { endsAt } = local.timer;
    if (!ready || endsAt === null) return;
    const tick = () => {
      if (remainingAt(local.timer, Date.now()) === 0) {
        // Credit the day the timer ended, which may be before a relaunch.
        completeTask("meditation", new Date(endsAt));
        setLocal((state) => ({
          ...state,
          timer: { ...state.timer, remainingSeconds: 0, endsAt: null },
        }));
      }
    };
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [local.timer, ready, completeTask]);
  const value = useMemo<AppContextValue>(
    () => ({
      local,
      ready,
      storageError,
      catalog,
      catalogMode,
      t: (key) => translate(local.language, key),
      setLanguage: (language) => setLocal((state) => ({ ...state, language })),
      update: setLocal,
      retry,
      retryStorage,
      connection,
      searchContent,
      getContent,
      getHome,
      getMandirDecor,
      setCatalogMode,
      toggleFavorite: (id) => {
        analytics.track("content_favorite", { content_id: id });
        const favorite = !favoritesRef.current.includes(id);
        // Optimistic: the device cache changes now; the account write is
        // queued durably and retried until it lands.
        const next = (ids: string[]) => {
          const rest = ids.filter((value) => value !== id);
          if (!favorite) return rest;
          // The account list is newest first; device-only keeps add order.
          return sync ? [id, ...rest] : [...rest, id];
        };
        favoritesRef.current = next(favoritesRef.current);
        setLocal((state) => ({ ...state, favorites: next(state.favorites) }));
        if (!sync) unsynced.current.set(id, favorite);
        sync
          ?.setFavorite(
            id,
            favorite,
            catalog?.content.find((item) => item.id === id)?.type,
          )
          .catch(() => setStorageError(true));
      },
      favoritesStatus: {
        source: sync ? "account" : "device",
        ...pendingFavorites,
      },
      refreshFavorites,
      completeTask,
      progression: (session && backend?.progression) || null,
      session,
    }),
    [
      local,
      ready,
      storageError,
      catalog,
      catalogMode,
      retry,
      retryStorage,
      connection,
      searchContent,
      getContent,
      getHome,
      getMandirDecor,
      sync,
      pendingFavorites,
      refreshFavorites,
      completeTask,
      backend,
      session,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider is required");
  return value;
}
