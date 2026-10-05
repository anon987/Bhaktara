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
import { useApp } from "../../app/providers/AppProvider";
import {
  bhaktiDayAt,
  DEFAULT_TIMEZONE,
  defaultSadhanaConfig,
  isValidTimeZone,
  PracticeResult,
  SadhanaConfig,
} from "../../domain/progression";
import { remainingAt } from "../../domain/practice";
import {
  PracticeFailure,
  practiceFailure,
  ProgressSnapshot,
} from "../../repositories/progressionRepository";
import { BEADS } from "./art/MalaRing";

// Server-backed Sadhana (doc 08 §2, D-050): practice always works, but XP,
// streaks, challenges and badges are earned only when the server can record
// the session. Offline or in fixture mode the practice is kept on the device.

export type PracticeKind = "mala" | "meditation" | "prayer";
export type Blessing = {
  kind: PracticeKind;
  result: PracticeResult;
  key: number;
};
export type PracticeNotice = {
  kind: "offline" | "tooShort" | "error";
  key: number;
};
type Status = "off" | "loading" | "ready" | "offline";

type ProgressionValue = {
  status: Status;
  snapshot: ProgressSnapshot | null;
  sadhana: SadhanaConfig;
  today: () => string;
  refresh: () => Promise<void>;
  // Jaap: beads chanted today and the tap handler.
  jaapCount: number;
  tapBead: () => void;
  resetMala: () => void;
  // Meditation timer.
  startMeditation: () => void;
  pauseMeditation: () => void;
  resetMeditation: () => void;
  setMeditationMinutes: (minutes: number) => void;
  // Prayer checklist.
  // The server's status, or null when it could not be reached.
  offerPrayer: (itemIds: string[]) => Promise<PracticeResult["status"] | null>;
  blessing: Blessing | null;
  dismissBlessing: () => void;
  // Latest mala result, for the inline jaap celebration.
  malaBlessing: Blessing | null;
  notice: PracticeNotice | null;
};

const Context = createContext<ProgressionValue | null>(null);

export const deviceTimezone = () => {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

// Client-generated session IDs make startSession safe to retry (doc 08 §5).
export const newSessionId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}${Math.random()
    .toString(36)
    .slice(2, 10)}`.replace(/[^A-Za-z0-9]/g, "x");

export function ProgressionProvider({ children }: React.PropsWithChildren) {
  const { progression, local, update, completeTask, ready } = useApp();
  const [timezone, setTimezone] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [serverStatus, setStatus] = useState<Exclude<Status, "off">>("loading");
  const status: Status = progression ? serverStatus : "off";
  const [blessing, setBlessing] = useState<Blessing | null>(null);
  const [malaBlessing, setMalaBlessing] = useState<Blessing | null>(null);
  const [notice, setNotice] = useState<PracticeNotice | null>(null);
  const counter = useRef(0);
  const nextKey = () => (counter.current += 1);

  const zone = timezone ?? deviceTimezone();
  const today = useCallback(() => bhaktiDayAt(Date.now(), zone), [zone]);

  const lastLoad = useRef(0);
  // Read inside callbacks only; the server's answer is the timezone in use.
  const confirmedZone = useRef<string | null>(null);
  const language = useRef(local.language);
  useEffect(() => {
    language.current = local.language;
  }, [local.language]);
  const refresh = useCallback((): Promise<void> => {
    if (!progression) return Promise.resolve();
    const confirm = confirmedZone.current
      ? Promise.resolve(confirmedZone.current)
      : progression
          .setTimezone(deviceTimezone(), language.current)
          .then(({ timezone: confirmed }) => {
            confirmedZone.current = confirmed;
            setTimezone(confirmed);
            return confirmed;
          });
    return confirm
      .then((confirmed) => progression.load(confirmed))
      .then((next) => {
        setSnapshot(next);
        lastLoad.current = Date.now();
        setStatus("ready");
      })
      .catch((error: unknown) => {
        // Codes only: no tokens or user data in logs.
        console.warn(
          "[progression] refresh failed",
          (error as { code?: string })?.code ?? String(error),
        );
        setStatus("offline");
      });
  }, [progression]);

  useEffect(() => {
    if (!progression) return;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastLoad.current > 30_000)
        void refresh();
    });
    const first = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(first);
      listener.remove();
    };
  }, [progression, refresh]);

  const fail = useCallback((failure: PracticeFailure) => {
    if (failure.kind === "offline") setStatus("offline");
    setNotice({
      kind:
        failure.kind === "rejected" && failure.reason === "SESSION_TOO_SHORT"
          ? "tooShort"
          : failure.kind === "offline"
            ? "offline"
            : "error",
      key: nextKey(),
    });
  }, []);

  const celebrate = useCallback(
    (kind: PracticeKind, result: PracticeResult) => {
      // A repeat of a practice already credited today earns nothing; the
      // screen closes it quietly instead of showing a 0 XP blessing.
      if (result.status === "ALREADY_DONE") return;
      const entry = { kind, result, key: nextKey() };
      // Every mala gets the inline celebration; milestones get the full sheet.
      if (kind === "mala") setMalaBlessing(entry);
      if (
        kind !== "mala" ||
        result.badgesUnlocked.length > 0 ||
        result.challengesCompleted.length > 0 ||
        result.levelUp ||
        result.fullSadhana !== (snapshot?.today.fullSadhana ?? false)
      )
        setBlessing(entry);
      setStatus("ready");
      setSnapshot(
        (current) =>
          current && {
            ...current,
            totalXp: result.totalXp,
            level: result.level,
            rank: result.rank,
            currentStreak: result.currentStreak,
            longestStreak: result.longestStreak,
            today: {
              ...current.today,
              tasks: result.tasks,
              fullSadhana: result.fullSadhana,
              qualifying: current.today.qualifying || result.currentStreak > 0,
            },
          },
      );
      // Challenges, badges and history come from a fresh read.
      void refresh();
    },
    [refresh, snapshot?.today.fullSadhana],
  );

  // ---- Jaap --------------------------------------------------------------
  const day = today();
  const jaapCount = local.jaapDay === day ? local.jaapCount : 0;
  const countRef = useRef(jaapCount);
  const dayRef = useRef(local.jaapDay);
  useEffect(() => {
    countRef.current = jaapCount;
    dayRef.current = local.jaapDay;
  }, [jaapCount, local.jaapDay]);
  // The open session of the mala in progress; persisted in local state.
  const session = useRef<{ id: string; started: Promise<boolean> } | null>(
    null,
  );
  useEffect(() => {
    if (!ready || session.current) return;
    if (local.jaapSessionId && local.jaapDay === day)
      session.current = {
        id: local.jaapSessionId,
        started: Promise.resolve(true),
      };
  }, [ready, local.jaapSessionId, local.jaapDay, day]);

  const startJaapSession = useCallback(() => {
    if (!progression || session.current) return;
    const id = newSessionId();
    const started = progression
      .startSession({
        sessionId: id,
        type: "JAAP",
        deityId: local.deityId ?? undefined,
      })
      .then(() => {
        update((state) => ({ ...state, jaapSessionId: id }));
        return true;
      })
      .catch((error: unknown) => {
        if (session.current?.id === id) session.current = null;
        fail(practiceFailure(error));
        return false;
      });
    session.current = { id, started };
  }, [progression, local.deityId, update, fail]);

  const tapBead = useCallback(() => {
    const current = today();
    const base = dayRef.current === current ? countRef.current : 0;
    if (dayRef.current !== current) session.current = null;
    const count = base + 1;
    countRef.current = count;
    dayRef.current = current;
    update((state) => ({
      ...state,
      jaapDay: current,
      jaapCount: count,
      jaapSessionId: state.jaapDay === current ? state.jaapSessionId : null,
    }));
    if (count % BEADS !== 0) {
      startJaapSession();
      return;
    }
    // A full mala: kept on the device, and credited if a session is open.
    completeTask("jaap");
    const finished = session.current;
    session.current = null;
    update((state) => ({ ...state, jaapSessionId: null }));
    if (!finished || !progression) return;
    void finished.started.then(async (ok) => {
      if (!ok) return;
      try {
        const result = await progression.completeSession({
          sessionId: finished.id,
          malasCompleted: 1,
        });
        celebrate("mala", result);
      } catch (error) {
        fail(practiceFailure(error));
      }
    });
  }, [
    today,
    update,
    startJaapSession,
    completeTask,
    progression,
    celebrate,
    fail,
  ]);

  const resetMala = useCallback(() => {
    // Back to the start of the current mala; malas already done stay.
    const done = Math.floor(countRef.current / BEADS) * BEADS;
    countRef.current = done;
    session.current = null;
    update((state) => ({ ...state, jaapCount: done, jaapSessionId: null }));
  }, [update]);

  // ---- Meditation --------------------------------------------------------
  const startMeditation = useCallback(() => {
    const id = local.timer.sessionId ?? (progression ? newSessionId() : null);
    const now = Date.now();
    update((state) => {
      const remainingSeconds =
        state.timer.remainingSeconds || state.timer.durationSeconds;
      return {
        ...state,
        timer: {
          ...state.timer,
          remainingSeconds,
          endsAt: now + remainingSeconds * 1000,
          sessionId: id,
        },
      };
    });
    if (id && progression && !local.timer.sessionId)
      progression
        .startSession({
          sessionId: id,
          type: "MEDITATION",
          targetMinutes: Math.round(local.timer.durationSeconds / 60),
        })
        .catch((error: unknown) => {
          update((state) =>
            state.timer.sessionId === id
              ? { ...state, timer: { ...state.timer, sessionId: null } }
              : state,
          );
          fail(practiceFailure(error));
        });
  }, [
    local.timer.sessionId,
    local.timer.durationSeconds,
    progression,
    update,
    fail,
  ]);

  const pauseMeditation = useCallback(() => {
    const now = Date.now();
    update((state) => ({
      ...state,
      timer: {
        ...state.timer,
        remainingSeconds: remainingAt(state.timer, now),
        endsAt: null,
      },
    }));
  }, [update]);

  const completeMeditation = useCallback(
    (sessionId: string, minutes: number) => {
      if (!progression || minutes <= 0) return;
      progression
        .completeSession({ sessionId, minutesCompleted: minutes })
        .then((result) => celebrate("meditation", result))
        .catch((error: unknown) => fail(practiceFailure(error)));
    },
    [progression, celebrate, fail],
  );

  const resetMeditation = useCallback(() => {
    const { sessionId, durationSeconds } = local.timer;
    const elapsed = durationSeconds - remainingAt(local.timer, Date.now());
    // Stopping early still credits the whole minutes already sat.
    if (sessionId) completeMeditation(sessionId, Math.floor(elapsed / 60));
    update((state) => ({
      ...state,
      timer: {
        durationSeconds: state.timer.durationSeconds,
        remainingSeconds: state.timer.durationSeconds,
        endsAt: null,
        sessionId: null,
      },
    }));
  }, [local.timer, completeMeditation, update]);

  const setMeditationMinutes = useCallback(
    (minutes: number) =>
      update((state) =>
        state.timer.endsAt !== null || state.timer.sessionId
          ? state
          : {
              ...state,
              timer: {
                durationSeconds: minutes * 60,
                remainingSeconds: minutes * 60,
                endsAt: null,
                sessionId: null,
              },
            },
      ),
    [update],
  );

  // The timer finished (AppProvider stops it, also after a relaunch).
  useEffect(() => {
    const { sessionId, remainingSeconds, endsAt, durationSeconds } =
      local.timer;
    if (!ready || !sessionId || endsAt !== null || remainingSeconds !== 0)
      return;
    update((state) => ({
      ...state,
      timer: { ...state.timer, sessionId: null },
    }));
    completeMeditation(sessionId, Math.round(durationSeconds / 60));
  }, [ready, local.timer, update, completeMeditation]);

  // ---- Prayer ------------------------------------------------------------
  const offerPrayer = useCallback(
    async (itemIds: string[]) => {
      completeTask("prayer");
      if (!progression) return "COMPLETED" as const;
      try {
        const result = await progression.completePrayer({
          bhaktiDay: today(),
          itemIds,
        });
        celebrate("prayer", result);
        return result.status;
      } catch (error) {
        fail(practiceFailure(error));
        return null;
      }
    },
    [completeTask, progression, today, celebrate, fail],
  );

  const value = useMemo<ProgressionValue>(
    () => ({
      status,
      snapshot,
      sadhana: snapshot?.sadhana ?? defaultSadhanaConfig,
      today,
      refresh,
      jaapCount,
      tapBead,
      resetMala,
      startMeditation,
      pauseMeditation,
      resetMeditation,
      setMeditationMinutes,
      offerPrayer,
      blessing,
      dismissBlessing: () => setBlessing(null),
      malaBlessing,
      notice,
    }),
    [
      status,
      snapshot,
      today,
      refresh,
      jaapCount,
      tapBead,
      resetMala,
      startMeditation,
      pauseMeditation,
      resetMeditation,
      setMeditationMinutes,
      offerPrayer,
      blessing,
      malaBlessing,
      notice,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

// For widgets that may render outside the provider (e.g. Home in tests).
export const useOptionalProgression = () => useContext(Context);

export function useProgression() {
  const value = useContext(Context);
  if (!value) throw new Error("ProgressionProvider is required");
  return value;
}
