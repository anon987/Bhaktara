import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import Svg, { Circle, G, Path } from "react-native-svg";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { useDialog } from "../../components/Dialog";
import { Txt } from "../../components/ui";
import { useReducedMotion } from "../../components/useReducedMotion";
import { formatTime, remainingAt } from "../../domain/practice";
import { MalaKind, mantraFor } from "../../domain/mantras";
import { shrine } from "../../theme/tokens";
import { Flower2, Pause, Play, RotateCcw } from "lucide-react-native";
import { DeityEmblem } from "./art/Emblems";
import {
  FlankLines,
  LotusDivider,
  SerifText,
  SlotImage,
} from "./shrine/Ornaments";
import {
  PracticeToggles,
  SaffronButton,
  ShrinePage,
  SwitchRow,
} from "./shrine/ShrinePage";
import { Diya } from "./art/Diya";
import { BEADS, MalaRing } from "./art/MalaRing";
import { PetalShower } from "./art/PetalShower";
import { beadTick, malaPulse, useBell } from "./feedback";
import { useJaapCount, useProgression } from "./ProgressionProvider";
import { EarningNote } from "./Sanctum";

// ---- Jaap: a 108-bead mala ------------------------------------------------

// D-057: on parchment under a marigold toran, the deity's emblem and full
// mantra above a polished wooden mala whose chanted beads turn gold.
export function JaapScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Jaap">) {
  const { t, local, update, catalog } = useApp();
  const ring = useBell();
  const { width, height } = useWindowDimensions();
  const deities = catalog?.deities ?? [];
  const deityId = local.deityId ?? deities[0]?.id ?? null;
  const deity = deities.find((item) => item.id === deityId);
  const devotion = mantraFor(deityId);
  const size = Math.min(width - 40, height * 0.38, 360);

  // The 108 beads are drawn once the screen has slid in, so the tap that
  // opens Jaap is answered at once.
  const [showBeads, setShowBeads] = useState(false);
  useEffect(() => {
    const show = () => setShowBeads(true);
    const fallback = setTimeout(show, 400);
    const off = navigation.addListener("transitionEnd", show);
    return () => {
      clearTimeout(fallback);
      off();
    };
  }, [navigation]);

  // Local celebration the moment a mala completes (online or not).
  const [completed, setCompleted] = useState(0);
  const onMalaComplete = useCallback(() => {
    setCompleted((key) => key + 1);
    malaPulse();
    ring();
  }, [ring]);

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
        <JaapCounter
          size={size}
          mala={devotion.mala}
          showBeads={showBeads}
          completed={completed}
          onMalaComplete={onMalaComplete}
        />
      </ScrollView>
      <PetalShower trigger={completed} />
    </ShrinePage>
  );
}

// Everything that changes with a bead: it reads the count itself, so a tap
// re-renders only the mala and its counts, not the page around them.
function JaapCounter({
  size,
  mala,
  showBeads,
  completed,
  onMalaComplete,
}: {
  size: number;
  mala: MalaKind;
  showBeads: boolean;
  completed: number;
  onMalaComplete: () => void;
}) {
  const { t } = useApp();
  const { tapBead, resetMala, malaBlessing } = useProgression();
  const jaapCount = useJaapCount();
  const showDialog = useDialog();
  const reduced = useReducedMotion();
  const beads = jaapCount % BEADS;
  const malas = Math.floor(jaapCount / BEADS);

  const previous = useRef(jaapCount);
  useEffect(() => {
    if (jaapCount > previous.current && jaapCount % BEADS === 0)
      onMalaComplete();
    previous.current = jaapCount;
  }, [jaapCount, onMalaComplete]);

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

  // Same elements every render, so a tap skips them.
  const settings = useMemo(
    () => (
      <>
        <EarningNote light />
        <PracticeToggles />
      </>
    ),
    [],
  );

  const countBead = () => {
    beadTick();
    tapBead();
  };

  return (
    <>
      {/* The mala is one large tap target (C-001: no ads may ever sit
          next to it). Counted on touch-down so every tap lands at once;
          not cancelable, so a finger that drifts is not taken as a scroll. */}
      <Pressable
        testID="jaap-counter"
        accessibilityRole="button"
        accessibilityLabel={`${t("tapAnywhere")}. ${beads} / ${BEADS}`}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={countBead}
        cancelable={false}
        onPressIn={countBead}
        style={styles.tapArea}
      >
        <View style={{ width: size, height: size }}>
          <MalaRing
            beads={beads}
            kind={mala}
            size={size}
            completedKey={completed}
            tone="light"
            showBeads={showBeads}
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
      {settings}
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
    </>
  );
}

// ---- Dhyan: meditation with a lamp ------------------------------------------

const durations = [5, 10, 15, 20];
const BREATH_MS = 5000;

export function MeditationScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Meditation">) {
  const { local, t, update, catalog } = useApp();
  const {
    startMeditation,
    pauseMeditation,
    resetMeditation,
    setMeditationMinutes,
  } = useProgression();
  const ring = useBell();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
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

  const size = Math.min(width - 64, height * 0.34, 320);
  const radius = 47;
  const circumference = 2 * Math.PI * radius;
  const fraction = 1 - remaining / timer.durationSeconds;
  const minutes = Math.round(timer.durationSeconds / 60);
  const lampKey = catalog?.visuals?.scenes.meditationLamp;
  const toggleSound = () =>
    update((state) => ({
      ...state,
      practice: { ...state.practice, sound: !state.practice.sound },
    }));

  // D-057: the brass lamp in a gold ring on parchment. The ring fills as
  // the sitting goes on; a small orb breathes with the words below.
  const lamp = (lit: boolean) => (
    <View style={[styles.lamp, { width: size, height: size }]}>
      {lit && running && !reduced && (
        <Animated.View
          style={[
            styles.halo,
            {
              width: size * 0.7,
              height: size * 0.7,
              borderRadius: size,
              opacity: breath.interpolate({
                inputRange: [0, 1],
                outputRange: [0.25, 0.55],
              }),
              transform: [
                {
                  scale: breath.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1.08],
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
        {/* Faint mandala */}
        <G opacity={0.28} fill="none" stroke={shrine.gold} strokeWidth={0.35}>
          {Array.from({ length: 12 }, (_, i) => (
            <Path
              key={i}
              d="M50 50 C 44 40, 44 26, 50 16 C 56 26, 56 40, 50 50 Z"
              transform={`rotate(${i * 30} 50 50)`}
            />
          ))}
          {Array.from({ length: 12 }, (_, i) => (
            <Path
              key={`o${i}`}
              d="M50 16 C 46 12, 47 8, 50 6 C 53 8, 54 12, 50 16 Z"
              transform={`rotate(${i * 30 + 15} 50 50)`}
            />
          ))}
          <Circle cx="50" cy="50" r="36" />
          <Circle cx="50" cy="50" r="41" />
        </G>
        <Circle
          cx="50"
          cy="50"
          r={radius}
          stroke={shrine.line}
          strokeWidth="1"
          fill="none"
        />
        {fraction > 0 && (
          <Circle
            cx="50"
            cy="50"
            r={radius}
            stroke={shrine.saffron}
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(circumference * fraction, 1.5)} ${circumference}`}
            rotation={-90}
            origin="50, 50"
          />
        )}
      </Svg>
      <SlotImage
        assetKey={lampKey}
        style={{ width: size * 0.56, height: size * 0.56 }}
        fallback={
          <Diya size={size * 0.52} lit={lit} glow={done ? 1 : 0.6} brass />
        }
      />
    </View>
  );

  return (
    <ShrinePage
      title={t("dhyanShort")}
      background="meditationBackground"
      onBack={navigation.goBack}
    >
      <ScrollView
        contentContainerStyle={styles.dhyanBody}
        showsVerticalScrollIndicator={false}
      >
        <SerifText size={18} bold={false} color={shrine.ink}>
          {t("dhyanTagline")}
        </SerifText>
        {choosing ? (
          <>
            <SerifText size={22} style={{ marginTop: 6 }}>
              {t("dhyanChoose")}
            </SerifText>
            <View style={styles.grid}>
              {durations.map((option) => {
                const selected = timer.durationSeconds === option * 60;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${option} ${t("minutes")}`}
                    onPress={() => setMeditationMinutes(option)}
                    style={[styles.tile, selected && styles.tileSelected]}
                  >
                    <SerifText
                      size={34}
                      color={selected ? shrine.maroonDeep : shrine.maroon}
                    >
                      {option}
                    </SerifText>
                    <Txt size={15} style={{ color: shrine.ink }}>
                      {t("minutes")}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            {lamp(false)}
            <SaffronButton
              label={t("lightLamp")}
              onPress={() => {
                ring();
                startMeditation();
              }}
            />
          </>
        ) : (
          <>
            {lamp(true)}
            <SerifText
              size={76}
              accessibilityRole="timer"
              style={{ lineHeight: 88 }}
            >
              {formatTime(remaining)}
            </SerifText>
            <SerifText size={19} bold={false} color={shrine.maroonDeep}>
              {local.language === "en"
                ? `${t("remainingOf")} ${minutes} ${t("minutesLong")}`
                : `${minutes} ${t("minutesLong")} में से शेष`}
            </SerifText>
            <LotusDivider
              width={220}
              assetKey={catalog?.visuals?.scenes.divider}
            />
            {done ? (
              <SerifText size={21}>{t("dhyanDone")}</SerifText>
            ) : (
              <View style={styles.breath}>
                <Animated.View
                  style={[
                    styles.orbRing,
                    !reduced &&
                      running && {
                        transform: [
                          {
                            scale: breath.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.75, 1.15],
                            }),
                          },
                        ],
                      },
                  ]}
                >
                  <View style={styles.orb} />
                </Animated.View>
                <SerifText size={21} style={{ minHeight: 30 }}>
                  {running && !reduced
                    ? inhale
                      ? t("breatheIn")
                      : t("breatheOut")
                    : ""}
                </SerifText>
              </View>
            )}
            {done ? (
              <SaffronButton label={t("lightLamp")} onPress={resetMeditation} />
            ) : (
              <>
                <SaffronButton
                  label={running ? t("pause") : t("resume")}
                  icon={
                    running ? (
                      <Pause
                        size={26}
                        color={shrine.maroonDeep}
                        fill={shrine.maroonDeep}
                      />
                    ) : (
                      <Play
                        size={26}
                        color={shrine.maroonDeep}
                        fill={shrine.maroonDeep}
                      />
                    )
                  }
                  onPress={running ? pauseMeditation : startMeditation}
                />
                <FlankLines width={60}>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={resetMeditation}
                    style={({ pressed }) => [
                      styles.restart,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <SerifText size={19}>{t("endDhyan")}</SerifText>
                  </Pressable>
                </FlankLines>
              </>
            )}
          </>
        )}
        <EarningNote light />
        <SwitchRow
          label={t("templeBells")}
          on={local.practice.sound}
          onPress={toggleSound}
        />
      </ScrollView>
    </ShrinePage>
  );
}

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
  dhyanBody: { gap: 10, paddingBottom: 28, paddingTop: 4 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  tile: {
    width: "42%",
    minHeight: 92,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: shrine.line,
    backgroundColor: shrine.ivory,
  },
  tileSelected: {
    backgroundColor: shrine.saffronLight,
    borderColor: shrine.saffronDeep,
  },
  lamp: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    backgroundColor: "rgba(255, 196, 92, 0.35)",
  },
  breath: { alignItems: "center", gap: 6 },
  orbRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(240, 162, 59, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(201, 151, 63, 0.35)",
  },
  orb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: shrine.saffron,
    borderWidth: 2,
    borderColor: shrine.saffronLight,
  },
});
