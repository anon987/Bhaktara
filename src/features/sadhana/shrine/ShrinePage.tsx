import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  ChevronLeft,
  Settings,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX,
} from "lucide-react-native";
import { useApp } from "../../../app/providers/AppProvider";
import { Txt } from "../../../components/ui";
import { SceneSlot } from "../../../domain/visuals";
import { shrine } from "../../../theme/tokens";
import { usePracticeFeedback } from "../feedback";
import {
  LotusDivider,
  MarigoldToran,
  ParchmentGround,
  SerifText,
} from "./Ornaments";

// The Prayer and Jaap screens (D-057): a sunlit marble shrine on parchment
// under a marigold toran. Round back and settings buttons flank a centred
// maroon serif title. Images chosen in the admin panel replace the drawn
// ground, toran and divider.
export function ShrinePage({
  title,
  subtitle,
  background,
  onBack,
  children,
}: React.PropsWithChildren<{
  title: string;
  subtitle?: string;
  background: SceneSlot;
  onBack: () => void;
}>) {
  const { t, catalog } = useApp();
  usePracticeFeedback();
  const scenes = catalog?.visuals?.scenes ?? {};
  const [settings, setSettings] = useState(false);
  return (
    <View style={styles.fill}>
      <ParchmentGround assetKey={scenes[background]} />
      <StatusBar style="dark" />
      <MarigoldToran assetKey={scenes.toran} />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.fill}>
        <View style={styles.header}>
          <RoundButton label={t("close")} onPress={onBack}>
            <ChevronLeft size={28} color={shrine.maroon} />
          </RoundButton>
          <View style={styles.titles}>
            <SerifText size={40} accessibilityRole="header">
              {title}
            </SerifText>
            {subtitle ? (
              <SerifText size={17} bold={false} color={shrine.ink}>
                {subtitle}
              </SerifText>
            ) : null}
          </View>
          <RoundButton
            label={t("practiceSettings")}
            selected={settings}
            onPress={() => setSettings((open) => !open)}
          >
            <Settings size={24} color={shrine.maroon} />
          </RoundButton>
        </View>
        <LotusDivider width={220} assetKey={scenes.divider} />
        {settings && <SettingsPanel />}
        <View style={styles.fill}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

export function RoundButton({
  label,
  onPress,
  selected,
  children,
}: React.PropsWithChildren<{
  label: string;
  onPress: () => void;
  selected?: boolean;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.round,
        selected && styles.roundSelected,
        pressed && { transform: [{ scale: 0.95 }] },
      ]}
    >
      {children}
    </Pressable>
  );
}

// Sound and vibration for the practice screens, saved on the device.
export function PracticeToggles({ style }: { style?: object }) {
  const { t, local, update } = useApp();
  const { sound, vibration } = local.practice;
  const set = (patch: Partial<typeof local.practice>) =>
    update((state) => ({
      ...state,
      practice: { ...state.practice, ...patch },
    }));
  return (
    <View style={[styles.toggles, style]}>
      <PillToggle
        label={t("practiceSound")}
        on={sound}
        onPress={() => set({ sound: !sound })}
        icon={
          sound ? (
            <Volume2 size={22} color={shrine.maroon} />
          ) : (
            <VolumeX size={22} color={shrine.inkMuted} />
          )
        }
      />
      <PillToggle
        label={t("practiceVibration")}
        on={vibration}
        onPress={() => set({ vibration: !vibration })}
        icon={
          vibration ? (
            <Vibrate size={22} color={shrine.maroon} />
          ) : (
            <VibrateOff size={22} color={shrine.inkMuted} />
          )
        }
      />
    </View>
  );
}

function PillToggle({
  label,
  on,
  icon,
  onPress,
}: {
  label: string;
  on: boolean;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        !on && styles.pillOff,
        pressed && { opacity: 0.85 },
      ]}
    >
      {icon}
      <Txt
        bold
        size={16}
        style={{ color: on ? shrine.maroon : shrine.inkMuted }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

function SettingsPanel() {
  return (
    <View style={styles.panel}>
      <PracticeToggles />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 44,
    gap: 8,
  },
  titles: { flex: 1, alignItems: "center" },
  round: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: shrine.ivory,
    borderWidth: 1.5,
    borderColor: shrine.line,
    shadowColor: shrine.goldDeep,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  roundSelected: { backgroundColor: shrine.saffronLight },
  toggles: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
  },
  pill: {
    minHeight: 52,
    minWidth: 140,
    paddingHorizontal: 18,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: shrine.ivory,
    borderWidth: 1.5,
    borderColor: shrine.line,
  },
  pillOff: { backgroundColor: "rgba(255, 248, 236, 0.55)" },
  panel: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: shrine.card,
    borderWidth: 1,
    borderColor: shrine.line,
  },
});
