import { useSyncExternalStore } from "react";

// True while Bhaktara is shrunk into its picture-in-picture window over the
// "Modify system settings" screen. The app root then renders only the
// "turn on the switch" guide, sized for the small window.
let active = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const settingsGuide = {
  show() {
    active = true;
    emit();
  },
  hide() {
    active = false;
    emit();
  },
  isActive: () => active,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useSettingsGuideActive = () =>
  useSyncExternalStore(settingsGuide.subscribe, settingsGuide.isActive);
