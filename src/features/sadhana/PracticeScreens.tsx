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
import { StringKey } from "../../i18n/strings";
import { sanctum } from "../../theme/tokens";
import { Diya } from "./art/Diya";
import { BEADS, MalaRing } from "./art/MalaRing";
import { PetalShower } from "./art/PetalShower";
import { Offering, offeringFor, Thali } from "./art/Thali";
import { beadTick, malaPulse, useBell } from "./feedback";
import { useProgression } from "./ProgressionProvider";
import {
  BrassButton,
  SanctumNote,
  SanctumPage,
  useNoticeText,
} from "./Sanctum";

// Practice notices stay readable for a while, then step aside.
function useTransientNotice() {
  const { notice } = useProgression();
  const [hidden, setHidden] = useState(0);
  useEffect(() => {
    if (!notice) return;
    const handle = setTimeout(() => setHidden(notice.key), 7000);
    return () => clearTimeout(handle);
  }, [notice]);
  const text = useNoticeText(notice);
  return notice && notice.key !== hidden ? text : null;
}

// Whether this practice can earn XP right now (D-050), as a quiet line.
function EarningNote() {
  const { t } = useApp();
  const { status } = useProgression();
  const transient = useTransientNotice();
  const text =
    transient ??
    (status === "off"
      ? t("deviceOnly")
      : status === "offline"
        ? t("earnOnline")
        : null);
  return text ? <SanctumNote text={text} /> : null;
}

// ---- Jaap: a 108-bead mala ------------------------------------------------

export function JaapScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Jaap">) {
  const { t, local, update, catalog } = useApp();
  const { jaapCount, tapBead, resetMala, malaBlessing } = useProgression();
  const showDialog = useDialog();
  const ring = useBell();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const deityId = local.deityId ?? catalog?.deities[0]?.id ?? null;
  const devotion = mantraFor(deityId);
  const beads = jaapCount % BEADS;
  const malas = Math.floor(jaapCount / BEADS);
  const size = Math.min(width - 24, height * 0.46, 380);

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
    <SanctumPage
      title={t("jaapShort")}
      subtitle={`${devotion.malaName[local.language]} · ${t("tapAnywhere")}`}
      onBack={navigation.goBack}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.chips}
        accessibilityLabel={t("chantFor")}
      >
        {catalog?.deities.map((item) => {
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
              <Txt
                bold
                size={17}
                style={{ color: selected ? sanctum.night : sanctum.text }}
              >
                {item.name[local.language]}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      {/* The whole middle of the screen is one large tap target (C-001: no
          ads may ever sit next to it). */}
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
          />
          <View style={styles.ringCenter} pointerEvents="none">
            <Txt
              bold
              size={size > 320 ? 22 : 19}
              style={{ color: sanctum.ghee, textAlign: "center" }}
            >
              {devotion.mantra[local.language]}
            </Txt>
            <Txt bold size={76} style={{ color: sanctum.text, lineHeight: 92 }}>
              {beads}
            </Txt>
            <Txt size={16} style={{ color: sanctum.textMuted }}>
              / {BEADS} {t("beadsLabel")}
            </Txt>
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
              <Txt bold size={30} style={{ color: sanctum.brassLight }}>
                +{malaBlessing.result.xpGranted} {t("points")}
              </Txt>
            </Animated.View>
          )}
        </View>
        <View style={styles.malaRow}>
          {Array.from({ length: Math.min(malas, 8) }, (_, i) => (
            <View key={i} style={styles.malaDot} />
          ))}
          <Txt bold size={20} style={{ color: sanctum.text }}>
            {malas} {t("malasToday")}
          </Txt>
        </View>
      </Pressable>
      <EarningNote />
      <View style={styles.footer}>
        <BrassButton
          quiet
          label={t("restartMala")}
          disabled={beads === 0}
          onPress={() =>
            showDialog(t("restartQuestion"), t("restartHint"), [
              { text: t("cancel"), style: "cancel" },
              { text: t("restartMala"), onPress: resetMala },
            ])
          }
        />
      </View>
      <PetalShower trigger={completed} />
    </SanctumPage>
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

// ---- Prarthana: offerings on a puja thali ------------------------------------

const offeringNames: Record<Offering, StringKey> = {
  pushp: "offeringPushp",
  deep: "offeringDeep",
  dhoop: "offeringDhoop",
  akshat: "offeringAkshat",
  ghanti: "offeringGhanti",
};

export function PrayerScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Prayer">) {
  const { t, local } = useApp();
  const { sadhana, snapshot, status, today, offerPrayer } = useProgression();
  const ring = useBell();
  const { width, height } = useWindowDimensions();
  const items = sadhana.prayerItems;
  const day = today();
  const doneToday =
    (status === "ready" && snapshot?.today.tasks.prayer) ||
    local.days[day]?.prayer === true;
  const [offered, setOffered] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [aarti, setAarti] = useState(false);
  const slots = items.map((_, index) => offeringFor(index));
  // Guided: one step at a time under a thali that stays in view, so every
  // offering is seen landing on the plate.
  const current = doneToday
    ? -1
    : items.findIndex((item) => !offered.includes(item.id));
  const step = current >= 0 ? items[current] : null;
  return (
    <SanctumPage
      title={t("prarthanaShort")}
      subtitle={t("prarthanaHint")}
      onBack={navigation.goBack}
    >
      <View style={styles.prayer}>
        <View style={{ alignItems: "center" }}>
          <Thali
            size={Math.min(width - 110, height * 0.34, 300)}
            slots={slots}
            offered={items.map(
              (item) => doneToday || offered.includes(item.id),
            )}
            aarti={doneToday || aarti}
          />
        </View>
        {doneToday ? (
          <SanctumNote text={t("prayerDoneToday")} />
        ) : step ? (
          <View style={styles.step}>
            <Txt size={15} bold style={{ color: sanctum.brassLight }}>
              {t("step")} {current + 1} / {items.length} ·{" "}
              {t(offeringNames[slots[current]])}
            </Txt>
            <Txt bold size={23} style={{ color: sanctum.text }}>
              {step.label[local.language]}
            </Txt>
            <BrassButton
              label={`${t("offer")} · ${t(offeringNames[slots[current]])}`}
              onPress={() => {
                ring();
                setOffered((values) => [...values, step.id]);
              }}
            />
          </View>
        ) : (
          <BrassButton
            label={t("completePrayer")}
            disabled={sending}
            onPress={async () => {
              setSending(true);
              setAarti(true);
              ring(2);
              await offerPrayer(items.map((item) => item.id));
              setSending(false);
            }}
          />
        )}
        <EarningNote />
      </View>
    </SanctumPage>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 10, paddingHorizontal: 20, paddingVertical: 8 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(243, 213, 138, 0.45)",
  },
  chipSelected: {
    backgroundColor: sanctum.brass,
    borderColor: sanctum.brassLight,
  },
  tapArea: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  ringCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 60,
  },
  float: {
    position: "absolute",
    alignSelf: "center",
    top: "38%",
  },
  malaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
  },
  malaDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: sanctum.brass,
    borderWidth: 1,
    borderColor: sanctum.brassLight,
  },
  footer: { padding: 20, paddingTop: 10 },
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
  prayer: { flex: 1, gap: 18, paddingHorizontal: 20, paddingBottom: 20 },
  step: {
    gap: 10,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "rgba(63, 26, 20, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(243, 213, 138, 0.3)",
  },
});
