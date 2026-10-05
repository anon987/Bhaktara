import { useCallback, useEffect, useRef } from "react";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { usePlayer } from "../player/PlayerProvider";

// A light tick for each bead, a firmer one when a mala completes. Haptics
// are a no-op on web and unavailable on some devices; failures are ignored.
export const beadTick = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
};
export const malaPulse = () => {
  void Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Success,
  ).catch(() => undefined);
};

// The temple bell (assets/sounds/bell.m4a, synthesised by
// scripts/media/generate-bell.py). Silent while a bhajan is playing, so it
// never interrupts the user's own audio.
export function useBell() {
  const { playing } = usePlayer();
  const bell = useRef<AudioPlayer | null>(null);
  useEffect(
    () => () => {
      bell.current?.remove();
      bell.current = null;
    },
    [],
  );
  return useCallback(
    (strikes = 1) => {
      if (playing) return;
      try {
        bell.current ??= createAudioPlayer(
          require("../../../assets/sounds/bell.m4a"),
        );
        const player = bell.current;
        for (let strike = 0; strike < strikes; strike += 1)
          setTimeout(() => {
            void player.seekTo(0);
            player.play();
          }, strike * 1600);
      } catch {
        // Sound is a nicety; practice continues without it.
      }
    },
    [playing],
  );
}
