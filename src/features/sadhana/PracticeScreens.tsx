import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { useDialog } from "../../components/Dialog";
import { Txt } from "../../components/ui";
import { useReducedMotion } from "../../components/useReducedMotion";
import { formatTime, remainingAt } from "../../domain/practice";
import { mantraFor } from "../../domain/mantras";
import { sanctum, shrine } from "../../theme/tokens";
import { Flower2, RotateCcw } from "lucide-react-native";
import { DeityEmblem } from "./art/Emblems";
import {
  FlankLines,
  LotusDivider,
  SerifText,
  SlotImage,
} from "./shrine/Ornaments";
import { PracticeToggles, ShrinePage } from "./shrine/ShrinePage";
import { Diya } from "./art/Diya";
import { BEADS, MalaRing } from "./art/MalaRing";
import { PetalShower } from "./art/PetalShower";
import { beadTick, malaPulse, useBell } from "./feedback";
import { useProgression } from "./ProgressionProvider";
import { BrassButton, EarningNote, SanctumPage } from "./Sanctum";

// ---- Jaap: a 108-bead mala ------------------------------------------------

// D-057: on parchment under a marigold toran, the deity's emblem and full
// mantra above a polished wooden mala whose chanted beads turn gold.
export function JaapScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Jaap">) {
  const { t, local, update, catalog } = useApp();
  const { jaapCount, tapBead, resetMala, malaBlessing } = useProgression();
  const showDialog = useDialog();
  const ring = useBell();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const deities = catalog?.deities ?? [];
  const deityId = local.deityId ?? deities[0]?.id ?? null;
  const deity = deities.find((item) => item.id === deityId);
  const devotion = mantraFor(deityId);
  const beads = jaapCount % BEADS;
  const malas = Math.floor(jaapCount / BEADS);
  const size = Math.min(width - 40, height * 0.38, 360);

  // Local celebration the moment a mala completes (online or not).
  const [completed, setCompleted] = useState(0);
  const previous = useRef(jaapCount);
  useEffect(() => {
    if (jaapCount > previous.current && jaapCount % BEADS === 0) {
      setCompleted((key) => key + 1);
      malaPulse();
      ring();
    }
    previous.current = jaapCount;
  }, [jaapCount, ring]);

  // "+15 XP" rises from the mala when the server credits it.
  const [float] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!malaBlessing) return;
    float.setValue(0);
    Animated.timing(float, {
      toValue: 1,
      duration: 2600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [malaBlessing, float]);

  return (
    <ShrinePage
      title={t("jaapShort")}
      subtitle={t("jaapTagline")}
      background="jaapBackground"
      onBack={navigation.goBack}
    >
      <ScrollView
        contentContainerStyle={styles.jaapBody}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.chips}
          accessibilityLabel={t("chantFor")}
        >
          {deities.map((item) => {
            const selected = item.id === deityId;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() =>
                  update((state) => ({ ...state, deityId: item.id }))
                }
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <SerifText
                  size={18}
                  color={selected ? shrine.maroonDeep : shrine.maroon}
                >
                  {item.name[local.language]}
                </SerifText>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.emblem}>
          <SlotImage
            assetKey={deity?.emblemKey}
            style={{ width: 200, height: 64 }}
            fallback={<DeityEmblem deityId={deityId} height={60} />}
          />
        </View>
        <SerifText size={24} style={{ paddingHorizontal: 12 }}>
          {devotion.mantra[local.language]}
        </SerifText>
        <LotusDivider width={260} assetKey={catalog?.visuals?.scenes.divider} />
        {/* The mala is one large tap target (C-001: no ads may ever sit
            next to it). */}
        <Pressable
          testID="jaap-counter"
          accessibilityRole="button"
          accessibilityLabel={`${t("tapAnywhere")}. ${beads} / ${BEADS}`}
          onPress={() => {
            beadTick();
            tapBead();
          }}
          style={styles.tapArea}
        >
          <View style={{ width: size, height: size }}>
            <MalaRing
              beads={beads}
              kind={devotion.mala}
              size={size}
              completedKey={completed}
              tone="light"
            />
            <View style={styles.ringCenter} pointerEvents="none">
              <LotusDivider width={70} />
              <SerifText
                size={size > 300 ? 88 : 72}
                style={{ lineHeight: size > 300 ? 100 : 84 }}
              >
                {beads}
              </SerifText>
              <SerifText size={20} bold={false} color={shrine.maroonDeep}>
                / {BEADS} {t("beadsLabel")}
              </SerifText>
              <LotusDivider width={110} />
              <SerifText size={15} bold={false} color={shrine.inkMuted}>
                {t("tapToCount")}
              </SerifText>
            </View>
            {malaBlessing && malaBlessing.result.xpGranted > 0 && !reduced && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.float,
                  {
                    opacity: float.interpolate({
                      inputRange: [0, 0.15, 0.75, 1],
                      outputRange: [0, 1, 1, 0],
                    }),
                    transform: [
                      {
                        translateY: float.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -size * 0.35],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Txt bold size={30} style={{ color: shrine.saffronDeep }}>
                  +{malaBlessing.result.xpGranted} {t("points")}
                </Txt>
              </Animated.View>
            )}
          </View>
        </Pressable>
        <FlankLines width={60}>
          <View style={styles.malaCount}>
            <Flower2 size={22} color={shrine.gold} />
            <SerifText size={20}>
              {malas} {t("malasToday")}
            </SerifText>
          </View>
        </FlankLines>
        <EarningNote light />
        <PracticeToggles />
        <FlankLines width={40}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: beads === 0 }}
            disabled={beads === 0}
            hitSlop={10}
            onPress={() =>
              showDialog(t("restartQuestion"), t("restartHint"), [
                { text: t("cancel"), style: "cancel" },
                { text: t("restartMala"), onPress: resetMala },
              ])
            }
            style={({ pressed }) => [
              styles.restart,
              (pressed || beads === 0) && { opacity: 0.5 },
            ]}
          >
            <RotateCcw size={20} color={shrine.maroon} />
            <SerifText size={17} bold={false}>
              {t("restartMalaShort")}
            </SerifText>
          </Pressable>
        </FlankLines>
      </ScrollView>
      <PetalShower trigger={completed} />
    </ShrinePage>
  );
}

// ---- Dhyan: meditation with a lamp ------------------------------------------

const durations = [5, 10, 15, 20];
const BREATH_MS = 5000;

export function MeditationScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Meditation">) {
  const { local, t } = useApp();
  const {
    startMeditation,
    pauseMeditation,
    resetMeditation,
    setMeditationMinutes,
  } = useProgression();
  const ring = useBell();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => Date.now());
  const { timer } = local;
  const remaining = remainingAt(timer, now);
  const running = timer.endsAt !== null;
  const done = remaining === 0;
  const choosing = !running && !done && remaining === timer.durationSeconds;
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    const listener = AppState.addEventListener("change", () =>
      setNow(Date.now()),
    );
    return () => {
      clearInterval(interval);
      listener.remove();
    };
  }, []);
  // Three soft strikes when the sitting ends.
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) ring(3);
    wasDone.current = done;
  }, [done, ring]);

  const [breath] = useState(() => new Animated.Value(0));
  const [inhale, setInhale] = useState(true);
  useEffect(() => {
    if (!running || reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: BREATH_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: BREATH_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    breath.setValue(0);
    loop.start();
    // The words follow the halo: in while it grows, out while it shrinks.
    let inhaling = true;
    const first = setTimeout(() => setInhale(true), 0);
    const toggle = setInterval(() => {
      inhaling = !inhaling;
      setInhale(inhaling);
    }, BREATH_MS);
    return () => {
      loop.stop();
      clearTimeout(first);
      clearInterval(toggle);
    };
  }, [running, reduced, breath]);

  const size = Math.min(width - 48, 320);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const fraction = 1 - remaining / timer.durationSeconds;

  return (
    <SanctumPage
      title={t("dhyanShort")}
      subtitle={t("dhyanHint")}
      onBack={navigation.goBack}
      scroll
    >
      {choosing ? (
        <>
          <Txt
            bold
            size={22}
            style={{ color: sanctum.text, textAlign: "center", marginTop: 8 }}
          >
            {t("dhyanChoose")}
          </Txt>
          <View style={styles.grid}>
            {durations.map((minutes) => {
              const selected = timer.durationSeconds === minutes * 60;
              return (
                <Pressable
                  key={minutes}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${minutes} ${t("minutes")}`}
                  onPress={() => setMeditationMinutes(minutes)}
                  style={[styles.tile, selected && styles.tileSelected]}
                >
                  <Txt
                    bold
                    size={40}
                    style={{
                      color: selected ? sanctum.night : sanctum.text,
                      lineHeight: 52,
                    }}
                  >
                    {minutes}
                  </Txt>
                  <Txt
                    size={17}
                    style={{
                      color: selected ? sanctum.night : sanctum.textMuted,
                    }}
                  >
                    {t("minutes")}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
          <View style={{ alignItems: "center" }}>
            <Diya size={150} lit={false} />
          </View>
          <BrassButton
            label={t("lightLamp")}
            onPress={() => {
              ring();
              startMeditation();
            }}
          />
        </>
      ) : (
        <>
          <View style={[styles.lamp, { width: size, height: size }]}>
            {running && !reduced && (
              <Animated.View
                style={[
                  styles.halo,
                  {
                    width: size * 0.82,
                    height: size * 0.82,
                    borderRadius: size,
                    opacity: breath.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.25, 0.6],
                    }),
                    transform: [
                      {
                        scale: breath.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.78, 1.08],
                        }),
                      },
                    ],
                  },
                ]}
              />
            )}
            <Svg
              width={size}
              height={size}
              viewBox="0 0 100 100"
              style={StyleSheet.absoluteFill}
            >
              <Circle
                cx="50"
                cy="50"
                r={radius}
                stroke="rgba(243, 213, 138, 0.18)"
                strokeWidth="2.4"
                fill="none"
              />
              <Circle
                cx="50"
                cy="50"
                r={radius}
                stroke={sanctum.brass}
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${circumference * fraction} ${circumference}`}
                rotation={-90}
                origin="50, 50"
              />
            </Svg>
            <Diya size={size * 0.52} lit glow={done ? 1 : 0.6} />
          </View>
          <Txt
            bold
            size={64}
            accessibilityRole="timer"
            style={{ color: sanctum.text, textAlign: "center", lineHeight: 80 }}
          >
            {formatTime(remaining)}
          </Txt>
          <Txt
            size={22}
            style={{ color: sanctum.ghee, textAlign: "center", minHeight: 34 }}
          >
            {done
              ? t("dhyanDone")
              : running && !reduced
                ? inhale
                  ? t("breatheIn")
                  : t("breatheOut")
                : ""}
          </Txt>
          {done ? (
            <BrassButton label={t("lightLamp")} onPress={resetMeditation} />
          ) : (
            <>
              <BrassButton
                label={running ? t("pause") : t("resume")}
                onPress={running ? pauseMeditation : startMeditation}
              />
              <BrassButton
                quiet
                label={t("endDhyan")}
                onPress={resetMeditation}
              />
            </>
          )}
        </>
      )}
      <EarningNote />
    </SanctumPage>
  );
}

// Prarthana is a short puja before the chosen deity (PujaScreen.tsx).
export { PrayerScreen } from "./PujaScreen";

const styles = StyleSheet.create({
  jaapBody: { gap: 8, paddingBottom: 24, alignItems: "stretch" },
  chips: {
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexGrow: 1,
    justifyContent: "center",
  },
  chip: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: shrine.line,
    backgroundColor: shrine.ivory,
  },
  chipSelected: {
    backgroundColor: shrine.saffron,
    borderColor: shrine.saffronDeep,
  },
  emblem: { alignItems: "center", minHeight: 64, justifyContent: "center" },
  tapArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  ringCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 50,
  },
  float: {
    position: "absolute",
    alignSelf: "center",
    top: "38%",
  },
  malaCount: { flexDirection: "row", alignItems: "center", gap: 10 },
  restart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "center",
  },
  tile: {
    width: "44%",
    minHeight: 104,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(243, 213, 138, 0.45)",
    backgroundColor: "rgba(63, 26, 20, 0.6)",
  },
  tileSelected: {
    backgroundColor: sanctum.brass,
    borderColor: sanctum.brassLight,
  },
  lamp: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    backgroundColor: "rgba(255, 158, 44, 0.25)",
  },
});
