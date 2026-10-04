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
import { Language, StringKey, translate } from "../../i18n/strings";
import { analytics } from "../../services/analytics";
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
  setCatalogMode: (mode: CatalogMode) => void;
  toggleFavorite: (id: string) => void;
  selectedContentId: string | null;
  selectContent: (id: string | null) => void;
  previewPlaying: boolean;
  setPreviewPlaying: (playing: boolean) => void;
  completeTask: (task: "jaap" | "meditation" | "prayer", at?: Date) => void;
};
const Context = createContext<AppContextValue | null>(null);
export function AppProvider({
  children,
  loadBackend = getBackend,
}: React.PropsWithChildren<{ loadBackend?: () => Promise<Backend> }>) {
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
  const [connection, setConnection] =
    useState<AppContextValue["connection"]>("loading");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [selectedContentId, selectContent] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const writes = useRef(Promise.resolve());
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
        await services.session.ensureSession();
        const data = await services.content.getCatalog();
        if (active) {
          setBackend(services);
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
      setCatalogMode,
      toggleFavorite: (id) => {
        analytics.track("content_favorite", { content_id: id });
        setLocal((state) => ({
          ...state,
          favorites: state.favorites.includes(id)
            ? state.favorites.filter((value) => value !== id)
            : [...state.favorites, id],
        }));
      },
      selectedContentId,
      selectContent,
      previewPlaying,
      setPreviewPlaying,
      completeTask,
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
      selectedContentId,
      previewPlaying,
      completeTask,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider is required");
  return value;
}
