import { useCallback, useEffect, useRef } from "react";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useApp } from "../../app/providers/AppProvider";
import { usePlayer } from "../player/PlayerProvider";

// The user's choice on the practice screens (local.practice), kept here so
// plain event handlers can read it. Every practice page keeps it in step.
const prefs = { sound: true, vibration: true };
export function usePracticeFeedback() {
  const { local } = useApp();
  const { sound, vibration } = local.practice;
  useEffect(() => {
    prefs.sound = sound;
    prefs.vibration = vibration;
  }, [sound, vibration]);
}

// A light tick for each bead, a firmer one when a mala completes. Haptics
// are a no-op on web and unavailable on some devices; failures are ignored.
export const beadTick = () => {
  if (!prefs.vibration) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
};
export const malaPulse = () => {
  if (!prefs.vibration) return;
  void Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Success,
  ).catch(() => undefined);
};

// Puja sounds, synthesised in the repo (scripts/media/generate-bell.py and
// generate-puja-sounds.py): the temple bell, the hand ghanti and the shankh.
// Silent while a bhajan or aarti is playing, so they never interrupt it.
const sources = {
  bell: require("../../../assets/sounds/bell.m4a"),
  ghanti: require("../../../assets/sounds/ghanti.m4a"),
  shankh: require("../../../assets/sounds/shankh.m4a"),
};
export type PujaSound = keyof typeof sources;

export function useSound() {
  const { playing } = usePlayer();
  const players = useRef<Partial<Record<PujaSound, AudioPlayer>>>({});
  useEffect(
    () => () => {
      for (const player of Object.values(players.current)) player?.remove();
      players.current = {};
    },
    [],
  );
  return useCallback(
    (sound: PujaSound, strikes = 1, gapMs = 1600) => {
      if (playing || !prefs.sound) return;
      try {
        const player = (players.current[sound] ??= createAudioPlayer(
          sources[sound],
        ));
        for (let strike = 0; strike < strikes; strike += 1)
          setTimeout(() => {
            void player.seekTo(0);
            player.play();
          }, strike * gapMs);
      } catch {
        // Sound is a nicety; practice continues without it.
      }
    },
    [playing],
  );
}

// The temple bell, struck `strikes` times.
export function useBell() {
  const play = useSound();
  return useCallback((strikes = 1) => play("bell", strikes), [play]);
}
