import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AudioPlayer,
  AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { Content } from "../../domain/models";
import { resolveMediaUrl } from "../../services/media/config";
import { analytics } from "../../services/analytics";
import { useApp } from "../../app/providers/AppProvider";
import {
  clampSeek,
  PlaySource,
  playableVariant,
  reachedCompletion,
} from "./playback";

export type PlayerStatus =
  | "idle"
  | "loading"
  | "ready"
  // The item has no playable variant, or no CDN is configured.
  | "unavailable"
  | "error";
type PlayerState = {
  item: Content | null;
  status: PlayerStatus;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
};
type PlayerApi = PlayerState & {
  load(item: Content, source: PlaySource): void;
  toggle(): void;
  seekTo(seconds: number): void;
  seekBy(delta: number): void;
  retry(): void;
  close(): void;
};

const idle: PlayerState = {
  item: null,
  status: "idle",
  playing: false,
  buffering: false,
  position: 0,
  duration: 0,
};
// A stream that never reports loaded is treated as failed.
const LOAD_TIMEOUT_MS = 20_000;
const Context = createContext<PlayerApi | null>(null);

// One app-wide audio player (doc 03: the mini-player persists across tabs).
// Background playback and lock-screen controls come from expo-audio's media
// service (doc 05 §platform services).
export function PlayerProvider({ children }: React.PropsWithChildren) {
  const [state, setState] = useState<PlayerState>(idle);
  const { local } = useApp();
  const language = useRef(local.language);
  useEffect(() => {
    language.current = local.language;
  }, [local.language]);
  const player = useRef<AudioPlayer | null>(null);
  const session = useRef<{
    item: Content;
    source: PlaySource;
    url: string;
    played: boolean;
    completed: boolean;
  } | null>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadTimer = () => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = null;
  };

  const onStatus = useCallback((status: AudioStatus) => {
    const current = session.current;
    if (!current) return;
    if (status.isLoaded) clearLoadTimer();
    const failed = /error|fail/i.test(status.playbackState);
    if (status.playing && !current.played) {
      current.played = true;
      analytics.track(
        current.source === "mandir" ? "mandir_aarti_play" : "content_play",
        {
          content_id: current.item.id,
          content_type: current.item.type,
          deity_id: current.item.deityIds[0] ?? "",
          source: current.source,
        },
      );
    }
    if (
      !current.completed &&
      reachedCompletion(status.currentTime, status.duration)
    ) {
      current.completed = true;
      analytics.track("content_complete", {
        content_id: current.item.id,
        content_type: current.item.type,
        source: current.source,
      });
    }
    if (status.didJustFinish) {
      // Return to the start, paused, so play restarts the track.
      void player.current?.seekTo(0);
      player.current?.pause();
    }
    setState((previous) => ({
      ...previous,
      status: failed ? "error" : status.isLoaded ? "ready" : previous.status,
      playing: status.playing && !status.didJustFinish,
      buffering: status.isBuffering,
      position: status.didJustFinish ? 0 : status.currentTime,
      duration: status.duration || previous.duration,
    }));
  }, []);

  const ensurePlayer = useCallback(() => {
    if (!player.current) {
      player.current = createAudioPlayer(null, { updateInterval: 500 });
      player.current.addListener("playbackStatusUpdate", onStatus);
      void setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: "doNotMix",
      }).catch(() => undefined);
    }
    return player.current;
  }, [onStatus]);

  const start = useCallback(
    (item: Content, source: PlaySource, url: string) => {
      const audio = ensurePlayer();
      session.current = { item, source, url, played: false, completed: false };
      clearLoadTimer();
      loadTimer.current = setTimeout(() => {
        setState((previous) =>
          previous.status === "loading"
            ? { ...previous, status: "error", playing: false, buffering: false }
            : previous,
        );
      }, LOAD_TIMEOUT_MS);
      setState({
        ...idle,
        item,
        status: "loading",
        duration: item.durationSeconds ?? 0,
      });
      try {
        audio.replace({ uri: url });
        audio.play();
        const artwork = resolveMediaUrl(item.media.thumb.key);
        audio.setActiveForLockScreen(
          true,
          {
            title: item.title[language.current],
            artist: "Bhaktara",
            ...(artwork ? { artworkUrl: artwork } : {}),
          },
          { showSeekForward: true, showSeekBackward: true },
        );
      } catch {
        clearLoadTimer();
        setState((previous) => ({ ...previous, status: "error" }));
      }
    },
    [ensurePlayer],
  );

  const load = useCallback(
    (item: Content, source: PlaySource) => {
      const variant = playableVariant(item);
      const url = variant ? resolveMediaUrl(variant.key) : null;
      if (session.current?.item.id === item.id && state.status !== "error") {
        // Re-opening the current item keeps its position.
        return;
      }
      if (!url) {
        player.current?.pause();
        player.current?.clearLockScreenControls();
        session.current = null;
        clearLoadTimer();
        setState({ ...idle, item, status: "unavailable" });
        return;
      }
      start(item, source, url);
    },
    [start, state.status],
  );

  const api = useMemo<PlayerApi>(
    () => ({
      ...state,
      load,
      toggle: () => {
        const audio = player.current;
        if (!audio || state.status !== "ready") return;
        if (audio.playing) audio.pause();
        else audio.play();
      },
      seekTo: (seconds) => {
        if (state.status !== "ready") return;
        void player.current?.seekTo(clampSeek(seconds, state.duration));
      },
      seekBy: (delta) => {
        if (state.status !== "ready") return;
        void player.current?.seekTo(
          clampSeek(state.position + delta, state.duration),
        );
      },
      retry: () => {
        const current = session.current;
        if (current) start(current.item, current.source, current.url);
      },
      close: () => {
        player.current?.pause();
        player.current?.clearLockScreenControls();
        session.current = null;
        clearLoadTimer();
        setState(idle);
      },
    }),
    [state, load, start],
  );

  useEffect(
    () => () => {
      clearLoadTimer();
      player.current?.remove();
      player.current = null;
    },
    [],
  );

  return <Context.Provider value={api}>{children}</Context.Provider>;
}

export function usePlayer() {
  const value = useContext(Context);
  if (!value) throw new Error("PlayerProvider is required");
  return value;
}
