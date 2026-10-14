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
// The sleep timer: pause after a number of minutes, or when the current
// track ends. Null turns it off.
export type SleepChoice = number | "end" | null;
type PlayerApi = PlayerState & {
  // Loop the current track (for this session only).
  repeat: boolean;
  setRepeat(on: boolean): void;
  // When the sleep timer pauses (epoch ms), or null.
  sleepAt: number | null;
  // The sleep timer pauses when the current track ends.
  sleepAtEnd: boolean;
  setSleep(choice: SleepChoice): void;
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
// The sleep timer lowers the volume over this long before it pauses.
export const SLEEP_FADE_MS = 5_000;
const FADE_STEPS = 20;
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
  const [repeat, setRepeatState] = useState(false);
  const [sleep, setSleepState] = useState<{
    at: number | null;
    atEnd: boolean;
  }>({ at: null, atEnd: false });
  // Read by the status listener, which is created once.
  const repeatRef = useRef(false);
  const sleepAtEndRef = useRef(false);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // The volume before a sleep fade, put back when the fade ends or stops.
  const fadeFrom = useRef<number | null>(null);

  const clearLoadTimer = () => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = null;
  };
  // expo-audio loops natively when `loop` is set. "Pause at the end of this
  // bhajan" needs the track to finish, so it turns the native loop off.
  const applyLoop = useCallback(() => {
    const audio = player.current;
    if (!audio) return;
    try {
      audio.loop = repeatRef.current && !sleepAtEndRef.current;
    } catch {
      // Older players without `loop`: the finish handler restarts instead.
    }
  }, []);
  const clearSleepTimers = useCallback(() => {
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    sleepTimer.current = null;
    if (fadeTimer.current) clearInterval(fadeTimer.current);
    fadeTimer.current = null;
    if (fadeFrom.current !== null && player.current)
      player.current.volume = fadeFrom.current;
    fadeFrom.current = null;
  }, []);
  const endSleep = useCallback(() => {
    clearSleepTimers();
    sleepAtEndRef.current = false;
    setSleepState({ at: null, atEnd: false });
    applyLoop();
  }, [applyLoop, clearSleepTimers]);
  // The timer is up: fade out over SLEEP_FADE_MS when the player has a
  // volume, then pause and restore the volume for next time.
  const sleepNow = useCallback(() => {
    const audio = player.current;
    sleepTimer.current = null;
    // Pauses first, then endSleep puts the volume back.
    const finish = () => {
      audio?.pause();
      endSleep();
    };
    if (!audio || typeof audio.volume !== "number" || !audio.playing)
      return finish();
    const start = audio.volume;
    fadeFrom.current = start;
    let step = 0;
    fadeTimer.current = setInterval(() => {
      step += 1;
      if (step >= FADE_STEPS) return finish();
      audio.volume = start * (1 - step / FADE_STEPS);
    }, SLEEP_FADE_MS / FADE_STEPS);
  }, [endSleep]);

  const endSleepRef = useRef(endSleep);
  useEffect(() => {
    endSleepRef.current = endSleep;
  }, [endSleep]);

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
    // Repeat restarts the track, unless the sleep timer waits for its end.
    const restart =
      status.didJustFinish && repeatRef.current && !sleepAtEndRef.current;
    if (status.didJustFinish) {
      // Return to the start; paused (play restarts the track) unless
      // repeating.
      void player.current?.seekTo(0);
      if (restart) player.current?.play();
      else player.current?.pause();
      if (sleepAtEndRef.current) endSleepRef.current();
    }
    setState((previous) => ({
      ...previous,
      status: failed ? "error" : status.isLoaded ? "ready" : previous.status,
      playing: restart || (status.playing && !status.didJustFinish),
      buffering: status.isBuffering,
      position: status.didJustFinish ? 0 : status.currentTime,
      duration: status.duration || previous.duration,
    }));
  }, []);

  const ensurePlayer = useCallback(() => {
    if (!player.current) {
      player.current = createAudioPlayer(null, { updateInterval: 500 });
      player.current.addListener("playbackStatusUpdate", onStatus);
      applyLoop();
      void setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: "doNotMix",
      }).catch(() => undefined);
    }
    return player.current;
  }, [onStatus, applyLoop]);

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

  const setRepeat = useCallback(
    (on: boolean) => {
      repeatRef.current = on;
      setRepeatState(on);
      applyLoop();
    },
    [applyLoop],
  );
  const setSleep = useCallback(
    (choice: SleepChoice) => {
      clearSleepTimers();
      if (choice === null) return endSleep();
      if (choice === "end") {
        sleepAtEndRef.current = true;
        setSleepState({ at: null, atEnd: true });
        applyLoop();
        return;
      }
      sleepAtEndRef.current = false;
      applyLoop();
      const ms = choice * 60_000;
      sleepTimer.current = setTimeout(sleepNow, ms);
      setSleepState({ at: Date.now() + ms, atEnd: false });
    },
    [applyLoop, clearSleepTimers, endSleep, sleepNow],
  );

  // The commands below read the latest state from here, so they keep one
  // identity across the frequent position updates (memoised screens that
  // take them do not re-render on every tick).
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  const toggle = useCallback(() => {
    const audio = player.current;
    if (!audio || latest.current.status !== "ready") return;
    if (audio.playing) audio.pause();
    else audio.play();
  }, []);
  const seekTo = useCallback((seconds: number) => {
    const { status, duration } = latest.current;
    if (status !== "ready") return;
    void player.current?.seekTo(clampSeek(seconds, duration));
  }, []);
  const seekBy = useCallback((delta: number) => {
    const { status, duration, position } = latest.current;
    if (status !== "ready") return;
    void player.current?.seekTo(clampSeek(position + delta, duration));
  }, []);
  const retry = useCallback(() => {
    const current = session.current;
    if (current) start(current.item, current.source, current.url);
  }, [start]);
  const close = useCallback(() => {
    player.current?.pause();
    player.current?.clearLockScreenControls();
    session.current = null;
    clearLoadTimer();
    endSleep();
    setState(idle);
  }, [endSleep]);

  const api = useMemo<PlayerApi>(
    () => ({
      ...state,
      repeat,
      setRepeat,
      sleepAt: sleep.at,
      sleepAtEnd: sleep.atEnd,
      setSleep,
      load,
      toggle,
      seekTo,
      seekBy,
      retry,
      close,
    }),
    [
      state,
      repeat,
      setRepeat,
      sleep,
      setSleep,
      load,
      toggle,
      seekTo,
      seekBy,
      retry,
      close,
    ],
  );

  useEffect(
    () => () => {
      clearLoadTimer();
      clearSleepTimers();
      player.current?.remove();
      player.current = null;
    },
    [clearSleepTimers],
  );

  return <Context.Provider value={api}>{children}</Context.Provider>;
}

export function usePlayer() {
  const value = useContext(Context);
  if (!value) throw new Error("PlayerProvider is required");
  return value;
}
