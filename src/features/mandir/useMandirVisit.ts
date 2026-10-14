import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { NavigationContext } from "@react-navigation/native";
import { useApp } from "../../app/providers/AppProvider";
import { useProgression } from "../sadhana/ProgressionProvider";

// How long the "today's darshan" note stays on the scene.
const NOTE_MS = 5000;

// The daily Mandir visit (doc 10: lighting the diya, 5 XP once per day).
// The first diya of a practice day records it with the server; the day is
// kept on the phone so later diyas (and later visits) do not ask again. An
// offline phone or a server without the function yet is ignored: the puja
// goes on, and the visit is not asked for again in this session. `note` is
// a small confirmation to show once (xp: the points granted, 0 when none).
export function useMandirVisit(deityId: string | undefined) {
  const { local, update } = useApp();
  const { visitMandir, today, snapshot } = useProgression();
  const [note, setNote] = useState<{ xp: number; key: number } | null>(null);
  const asked = useRef<string | null>(null);
  const savedDay = local.mandir.visitDay;
  const serverVisited =
    !!snapshot &&
    snapshot.bhaktiDay === today() &&
    snapshot.today.mandirVisited;

  const record = useCallback(() => {
    const day = today();
    if (!deityId || savedDay === day || asked.current === day) return;
    asked.current = day;
    const save = () =>
      update((state) => ({
        ...state,
        mandir: { ...state.mandir, visitDay: day },
      }));
    // Already counted today (another phone, or before a reinstall).
    if (serverVisited) return save();
    void visitMandir(deityId).then((visit) => {
      if (!visit) return;
      save();
      if (visit.status === "COMPLETED")
        setNote({ xp: visit.xp, key: Date.now() });
    });
  }, [deityId, savedDay, serverVisited, today, update, visitMandir]);

  useEffect(() => {
    if (!note) return;
    const handle = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(handle);
  }, [note]);

  return { record, note };
}

// Whether this tab is the one in view (true outside a navigator, as in
// tests), and a callback each time it comes into view.
export function useTabFocus(onFocus?: () => void): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  const focusRef = useRef(onFocus);
  useEffect(() => {
    focusRef.current = onFocus;
  }, [onFocus]);
  useEffect(() => {
    if (!navigation) {
      focusRef.current?.();
      return;
    }
    // Once per coming into view (the first focus may also be reported).
    let inView = false;
    const enter = () => {
      if (inView) return;
      inView = true;
      setFocused(true);
      focusRef.current?.();
    };
    const leave = () => {
      inView = false;
      setFocused(false);
    };
    if (navigation.isFocused()) enter();
    const offFocus = navigation.addListener("focus", enter);
    const offBlur = navigation.addListener("blur", leave);
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}
