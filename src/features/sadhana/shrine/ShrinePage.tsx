import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
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

// The Mandir, Jaap and Meditation screens (D-057): a sunlit marble shrine on
// parchment under a marigold toran. Round back and settings buttons flank a
// centred maroon serif title. Images chosen in the admin panel replace the
// drawn ground, toran and divider. A screen can put its own control (the
// Mandir's deity picker) in place of the title, and leave out settings; a
// tab (the Mandir) has no back button, and sets the status bar only while
// it is the tab in view.
export function ShrinePage({
  title,
  subtitle,
  header,
  settingsButton = true,
  background,
  onBack,
  statusBar = true,
  children,
}: React.PropsWithChildren<{
  title: string;
  subtitle?: string;
  header?: React.ReactNode;
  settingsButton?: boolean;
  background: SceneSlot;
  onBack?: () => void;
  statusBar?: boolean;
}>) {
  const { t, catalog } = useApp();
  usePracticeFeedback();
  const scenes = catalog?.visuals?.scenes ?? {};
  const [settings, setSettings] = useState(false);
  return (
    <View style={styles.fill}>
      <ParchmentGround assetKey={scenes[background]} />
      {statusBar && <StatusBar style="dark" />}
      <MarigoldToran assetKey={scenes.toran} />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.fill}>
        <View style={[styles.header, header ? styles.headerOver : null]}>
          {onBack ? (
            <RoundButton label={t("close")} onPress={onBack}>
              <ChevronLeft size={28} color={shrine.maroon} />
            </RoundButton>
          ) : (
            <View style={styles.roundSpace} />
          )}
          <View style={styles.titles}>
            {header ?? (
              <>
                <SerifText size={40} accessibilityRole="header">
                  {title}
                </SerifText>
                {subtitle ? (
                  <SerifText size={17} bold={false} color={shrine.ink}>
                    {subtitle}
                  </SerifText>
                ) : null}
              </>
            )}
          </View>
          {settingsButton ? (
            <RoundButton
              label={t("practiceSettings")}
              selected={settings}
              onPress={() => setSettings((open) => !open)}
            >
              <Settings size={24} color={shrine.maroon} />
            </RoundButton>
          ) : (
            <View style={styles.roundSpace} />
          )}
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

// The main action on the parchment screens: a saffron pill.
export function SaffronButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.saffron,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 },
      ]}
    >
      <LinearGradient
        colors={[shrine.saffronLight, shrine.saffron, shrine.saffronDeep]}
        locations={[0, 0.45, 1]}
        style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
      />
      <View style={styles.saffronContent}>
        {icon}
        <SerifText size={22} color={shrine.maroonDeep}>
          {label}
        </SerifText>
      </View>
    </Pressable>
  );
}

// A single on/off row: icon | label | switch (Meditation's sound).
export function SwitchRow({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.switchRow, pressed && { opacity: 0.85 }]}
    >
      {on ? (
        <Volume2 size={22} color={shrine.maroon} />
      ) : (
        <VolumeX size={22} color={shrine.inkMuted} />
      )}
      <View style={styles.switchDivider} />
      <Txt size={15} style={{ color: shrine.ink }}>
        {label}
      </Txt>
      <View style={[styles.track, on && styles.trackOn]}>
        <View style={[styles.knob, on && styles.knobOn]} />
      </View>
    </Pressable>
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
  // A header control's menu opens over the page below.
  headerOver: { zIndex: 10 },
  titles: { flex: 1, alignItems: "center" },
  roundSpace: { width: 54, height: 54 },
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
  saffron: {
    minHeight: 64,
    borderRadius: 32,
    marginHorizontal: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: shrine.saffronDeep,
    shadowColor: shrine.saffronDeep,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saffronContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 1,
  },
  switchRow: {
    alignSelf: "center",
    minHeight: 56,
    paddingHorizontal: 20,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: shrine.ivory,
    borderWidth: 1.5,
    borderColor: shrine.line,
  },
  switchDivider: { width: 1, height: 26, backgroundColor: shrine.line },
  track: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 3,
    backgroundColor: shrine.parchmentDeep,
    borderWidth: 1,
    borderColor: shrine.line,
  },
  trackOn: { backgroundColor: shrine.saffron, borderColor: shrine.saffronDeep },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  knobOn: { transform: [{ translateX: 22 }] },
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
