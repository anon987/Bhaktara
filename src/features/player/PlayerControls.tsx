import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  type LucideIcon,
} from "lucide-react-native";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { shrine } from "../../theme/tokens";
import { playerColors } from "./PlayerArt";
import { PLAYER_LAYOUT } from "./playerLayout";
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

// One row: repeat, back 15 s, the big gold play / pause (a spinner while
// loading) in the exact centre, forward 15 s, and an empty slot the size of
// the repeat button so play stays centred. Memoised: it does not follow the
// position updates.
export const TransportControls = React.memo(function TransportControls({
  playing,
  ready,
  loading,
  repeat,
  onToggle,
  onSeekBy,
  onRepeat,
}: {
  playing: boolean;
  ready: boolean;
  loading: boolean;
  repeat: boolean;
  onToggle: () => void;
  onSeekBy: (delta: number) => void;
  onRepeat: (on: boolean) => void;
}) {
  const { t } = useApp();
  const tap = useTapFeedback();
  const PlayIcon = playing ? Pause : Play;
  return (
    <View style={styles.transport} testID="player-controls">
      <Pressable
        testID="player-repeat"
        accessibilityRole="button"
        accessibilityLabel={`${t("repeat")}: ${t(repeat ? "repeatOnHint" : "repeatOffHint")}`}
        accessibilityState={{ selected: repeat }}
        onPress={() => {
          tap();
          onRepeat(!repeat);
        }}
        hitSlop={4}
        style={({ pressed }) => [
          styles.skip,
          repeat && styles.repeatOn,
          pressed && styles.pressed,
        ]}
      >
        <Repeat
          size={26}
          color={repeat ? shrine.maroonDeep : playerColors.brassLight}
        />
      </Pressable>
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
              size={38}
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
      {/* Balances the repeat button so play stays in the centre. */}
      <View style={styles.side} />
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
      <Icon size={24} color={playerColors.brassLight} style={styles.skipIcon} />
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

const SIDE = 54;
const PLAY = PLAYER_LAYOUT.playSize;

const styles = StyleSheet.create({
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
    marginTop: PLAYER_LAYOUT.controlsMarginTop,
    height: PLAY,
  },
  side: { width: SIDE, height: SIDE },
  skip: {
    width: SIDE,
    height: SIDE,
    borderRadius: SIDE / 2,
    borderWidth: 1.5,
    borderColor: playerColors.wellBorder,
    backgroundColor: playerColors.well,
    alignItems: "center",
    justifyContent: "center",
  },
  skipIcon: { marginBottom: 8 },
  repeatOn: {
    backgroundColor: playerColors.brassLight,
    borderColor: playerColors.brassLight,
  },
  skipLabel: {
    position: "absolute",
    bottom: 2,
    color: playerColors.brassLight,
    lineHeight: 15,
  },
  playOuter: {
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY / 2,
    padding: 4,
    backgroundColor: "rgba(255, 158, 44, 0.25)",
  },
  play: {
    flex: 1,
    borderRadius: PLAY / 2 - 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF1C9",
  },
});
