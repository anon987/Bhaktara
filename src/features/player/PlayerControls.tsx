import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  Check,
  Heart,
  Moon,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Share2,
  type LucideIcon,
} from "lucide-react-native";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { useReducedMotion } from "../../components/useReducedMotion";
import type { StringKey } from "../../i18n/strings";
import { shrine } from "../../theme/tokens";
import { playerColors } from "./PlayerArt";
import type { SleepChoice } from "./PlayerProvider";
import { SKIP_SECONDS } from "./SeekBar";

// A light tap under the finger, unless the devotee turned vibration off
// (the practice setting). Haptics are missing on some devices: ignored.
export function useTapFeedback() {
  const { local } = useApp();
  const vibration = local.practice.vibration;
  return React.useCallback(() => {
    if (!vibration) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
  }, [vibration]);
}

// Back 15 s, the big gold play / pause (a spinner while loading), forward
// 15 s. Memoised: it does not follow the position updates.
export const TransportControls = React.memo(function TransportControls({
  playing,
  ready,
  loading,
  onToggle,
  onSeekBy,
}: {
  playing: boolean;
  ready: boolean;
  loading: boolean;
  onToggle: () => void;
  onSeekBy: (delta: number) => void;
}) {
  const { t } = useApp();
  const tap = useTapFeedback();
  const PlayIcon = playing ? Pause : Play;
  return (
    <View style={styles.transport}>
      <SkipButton
        icon={RotateCcw}
        label={t("seekBack")}
        disabled={!ready}
        onPress={() => {
          tap();
          onSeekBy(-SKIP_SECONDS);
        }}
      />
      <Pressable
        testID="player-toggle"
        accessibilityRole="button"
        accessibilityLabel={t(playing ? "pause" : "play")}
        accessibilityState={{ disabled: !ready, busy: loading }}
        disabled={!ready}
        onPress={() => {
          tap();
          onToggle();
        }}
        style={({ pressed }) => [
          styles.playOuter,
          pressed && styles.pressed,
          !ready && !loading && { opacity: 0.5 },
        ]}
      >
        <LinearGradient
          colors={[playerColors.brassLight, playerColors.brass, "#B27A22"]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.play}
        >
          {loading ? (
            <ActivityIndicator
              testID="player-loading"
              size="large"
              color={shrine.maroonDeep}
            />
          ) : (
            <PlayIcon
              size={40}
              color={shrine.maroonDeep}
              fill={shrine.maroonDeep}
              style={!playing ? { marginLeft: 5 } : undefined}
            />
          )}
        </LinearGradient>
      </Pressable>
      <SkipButton
        icon={RotateCw}
        label={t("seekForward")}
        disabled={!ready}
        onPress={() => {
          tap();
          onSeekBy(SKIP_SECONDS);
        }}
      />
    </View>
  );
});

function SkipButton({
  icon: Icon,
  label,
  disabled,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.skip,
        pressed && styles.pressed,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Icon size={28} color={playerColors.brassLight} />
      <Txt
        bold
        size={13}
        style={styles.skipLabel}
        accessible={false}
        importantForAccessibility="no"
      >
        {SKIP_SECONDS}
      </Txt>
    </Pressable>
  );
}

// One of the large icon + label buttons under the controls.
function ActionButton({
  icon: Icon,
  label,
  onPress,
  active,
  accessibilityLabel,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        active && styles.actionActive,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        size={24}
        color={active ? shrine.maroonDeep : playerColors.brassLight}
        fill={active && Icon === Heart ? shrine.maroonDeep : "none"}
      />
      <Txt
        bold
        size={16}
        numberOfLines={2}
        style={[
          styles.actionLabel,
          { color: active ? shrine.maroonDeep : playerColors.text },
        ]}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const sleepOptions: [SleepChoice, StringKey][] = [
  [null, "sleepOff"],
  [15, "sleep15"],
  [30, "sleep30"],
  [60, "sleep60"],
  ["end", "sleepEnd"],
];

// Minutes left on the sleep timer, refreshed while it runs.
function useMinutesLeft(sleepAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sleepAt === null) return;
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 5_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [sleepAt]);
  if (sleepAt === null) return null;
  return Math.max(1, Math.ceil((sleepAt - now) / 60_000));
}

// Favourite, repeat, sleep timer and share: large, labelled, two by two.
export const PlayerActions = React.memo(function PlayerActions({
  favorite,
  repeat,
  sleepAt,
  sleepAtEnd,
  onFavorite,
  onRepeat,
  onSleep,
  onShare,
}: {
  favorite: boolean;
  repeat: boolean;
  sleepAt: number | null;
  sleepAtEnd: boolean;
  onFavorite: () => void;
  onRepeat: (on: boolean) => void;
  onSleep: (choice: SleepChoice) => void;
  onShare: () => void;
}) {
  const { t } = useApp();
  const tap = useTapFeedback();
  const [sheet, setSheet] = useState(false);
  const minutes = useMinutesLeft(sleepAt);
  const sleepLabel =
    minutes !== null
      ? t("sleepLeft").replace("{n}", String(minutes))
      : sleepAtEnd
        ? t("sleepEndShort")
        : t("sleepTimer");
  return (
    <View style={styles.actions}>
      <ActionButton
        testID="player-favorite"
        icon={Heart}
        active={favorite}
        label={t(favorite ? "favoriteSaved" : "favoriteShort")}
        accessibilityLabel={t(favorite ? "unfavorite" : "favorite")}
        onPress={() => {
          tap();
          onFavorite();
        }}
      />
      <ActionButton
        testID="player-repeat"
        icon={Repeat}
        active={repeat}
        label={t(repeat ? "repeatOn" : "repeat")}
        accessibilityLabel={`${t("repeat")}: ${t(repeat ? "repeatOnHint" : "repeatOffHint")}`}
        onPress={() => {
          tap();
          onRepeat(!repeat);
        }}
      />
      <ActionButton
        testID="player-sleep"
        icon={Moon}
        active={minutes !== null || sleepAtEnd}
        label={sleepLabel}
        accessibilityLabel={
          minutes !== null || sleepAtEnd
            ? `${t("sleepTimer")}: ${sleepLabel}`
            : t("sleepTimer")
        }
        onPress={() => {
          tap();
          setSheet(true);
        }}
      />
      <ActionButton
        testID="player-share"
        icon={Share2}
        label={t("sharePlayer")}
        onPress={() => {
          tap();
          onShare();
        }}
      />
      <SleepSheet
        visible={sheet}
        current={sleepAtEnd ? "end" : sleepAt !== null ? "timer" : null}
        onClose={() => setSheet(false)}
        onChoose={(choice) => {
          tap();
          setSheet(false);
          onSleep(choice);
        }}
      />
    </View>
  );
});

// The sleep timer choices in a parchment sheet from the bottom.
function SleepSheet({
  visible,
  current,
  onClose,
  onChoose,
}: {
  visible: boolean;
  current: "end" | "timer" | null;
  onClose: () => void;
  onChoose: (choice: SleepChoice) => void;
}) {
  const { t } = useApp();
  const reduced = useReducedMotion();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "slide"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("close")}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.grip} />
          <Txt
            bold
            size={24}
            accessibilityRole="header"
            style={styles.sheetTitle}
          >
            {t("sleepTimer")}
          </Txt>
          <Txt size={17} style={styles.sheetHint}>
            {t("sleepTimerHint")}
          </Txt>
          {sleepOptions.map(([choice, label]) => {
            // The minutes chosen aren't kept, so any running timer marks none
            // of the minute rows; "Off" and "End" are exact.
            const selected =
              (choice === null && current === null) ||
              (choice === "end" && current === "end");
            return (
              <Pressable
                key={label}
                testID={`sleep-${choice ?? "off"}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChoose(choice)}
                style={({ pressed }) => [
                  styles.option,
                  selected && styles.optionSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Txt bold size={19} style={styles.optionLabel}>
                  {t(label)}
                </Txt>
                {selected && <Check size={24} color={shrine.maroon} />}
              </Pressable>
            );
          })}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    marginTop: 6,
  },
  skip: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: playerColors.wellBorder,
    backgroundColor: playerColors.well,
    alignItems: "center",
    justifyContent: "center",
  },
  skipLabel: {
    position: "absolute",
    bottom: 4,
    color: playerColors.brassLight,
    lineHeight: 15,
  },
  playOuter: {
    width: 92,
    height: 92,
    borderRadius: 46,
    padding: 4,
    backgroundColor: "rgba(255, 158, 44, 0.25)",
  },
  play: {
    flex: 1,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF1C9",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  action: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: playerColors.wellBorder,
    backgroundColor: playerColors.well,
  },
  actionActive: {
    backgroundColor: playerColors.brassLight,
    borderColor: playerColors.brassLight,
  },
  actionLabel: { flex: 1 },
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(20, 6, 4, 0.6)",
  },
  sheet: {
    backgroundColor: shrine.parchment,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 3,
    borderColor: shrine.gold,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 10,
  },
  grip: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: shrine.line,
    marginBottom: 6,
  },
  sheetTitle: { color: shrine.maroon },
  sheetHint: { color: shrine.inkMuted, marginBottom: 4 },
  option: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: shrine.line,
    backgroundColor: shrine.ivory,
  },
  optionSelected: {
    borderColor: shrine.gold,
    backgroundColor: shrine.goldLight,
  },
  optionLabel: { color: shrine.ink, flex: 1 },
});
