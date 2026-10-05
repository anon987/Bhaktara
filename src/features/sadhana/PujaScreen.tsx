import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { mantraFor } from "../../domain/mantras";
import { PrayerItem, PujaStep } from "../../domain/progression";
import { StringKey } from "../../i18n/strings";
import { sanctum } from "../../theme/tokens";
import { PetalShower } from "./art/PetalShower";
import { Shrine } from "./art/Shrine";
import { AartiCircle } from "./Aarti";
import { malaPulse, useBell } from "./feedback";
import { useProgression } from "./ProgressionProvider";
import { BrassButton, EarningNote, SanctumNote, SanctumPage } from "./Sanctum";

const stepName: Record<PujaStep, StringKey> = {
  pushp: "pujaStepPushp",
  dhoop: "pujaStepDhoop",
  deep: "pujaStepDeep",
  naivedya: "pujaStepNaivedya",
  aarti: "pujaStepAarti",
  pranam: "pujaStepPranam",
};
const stepAction: Partial<Record<PujaStep, StringKey>> = {
  pushp: "pujaDoPushp",
  dhoop: "pujaDoDhoop",
  deep: "pujaDoDeep",
  naivedya: "pujaDoNaivedya",
  pranam: "pujaDoPranam",
};
const AARTI_ROUNDS = 3;

// Prarthana as a short puja before the chosen deity (D-053): flowers,
// incense, lamp and prasad are offered one at a time and appear on the altar;
// the aarti thali is circled round the deity three times; the puja ends with
// the kshama prarthana and a pranam, which records the day's prayer.
export function PrayerScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Prayer">) {
  const { t, local, update, catalog } = useApp();
  const { sadhana, snapshot, status, today, offerPrayer } = useProgression();
  const ring = useBell();
  const steps = sadhana.prayerItems;
  const deities = catalog?.deities ?? [];
  const deity = deities.find((item) => item.id === local.deityId) ?? deities[0];
  const devotion = mantraFor(deity?.id);
  const doneToday =
    (status === "ready" && snapshot?.today.tasks.prayer) ||
    local.days[today()]?.prayer === true;

  const [offered, setOffered] = useState<ReadonlySet<PujaStep>>(new Set());
  const [choosing, setChoosing] = useState(false);
  const [petals, setPetals] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [autoAarti, setAutoAarti] = useState(false);
  const [sending, setSending] = useState(false);

  const all = new Set(steps.map((step) => step.kind));
  const shown = doneToday ? all : offered;
  const current: PrayerItem | undefined = doneToday
    ? undefined
    : steps.find((step) => !offered.has(step.kind));
  const offer = (kind: PujaStep) =>
    setOffered((values) => new Set([...values, kind]));
  // The shrine fills the space left between the deity row and the step card.
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const shrineWidth = Math.min(stage.width, stage.height * (300 / 360), 320);

  const perform = async (step: PrayerItem) => {
    if (step.kind === "pushp") setPetals((key) => key + 1);
    if (step.kind !== "pranam") {
      ring();
      offer(step.kind);
      return;
    }
    // Pranam ends the puja and records the day's prayer.
    malaPulse();
    ring(3);
    setSending(true);
    offer("pranam");
    await offerPrayer(steps.map((item) => item.id));
    setSending(false);
  };

  return (
    <SanctumPage
      title={t("prarthanaShort")}
      subtitle={t("pujaHint")}
      onBack={navigation.goBack}
    >
      <View style={styles.body}>
        {deity && (
          <View style={styles.deityRow}>
            <View style={{ flex: 1 }}>
              <Txt bold size={22} style={{ color: sanctum.text }}>
                {deity.name[local.language]}
              </Txt>
              <Txt size={16} style={{ color: sanctum.ghee }}>
                {devotion.mantra[local.language]}
              </Txt>
            </View>
            {!doneToday && offered.size === 0 && deities.length > 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("pujaChoose")}
                onPress={() => setChoosing((value) => !value)}
                style={styles.change}
              >
                <Txt bold size={16} style={{ color: sanctum.brassLight }}>
                  {t("pujaChange")}
                </Txt>
              </Pressable>
            )}
          </View>
        )}
        {choosing && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.chips}
            accessibilityLabel={t("pujaChoose")}
          >
            {deities.map((item) => {
              const selected = item.id === deity?.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    update((state) => ({ ...state, deityId: item.id }));
                    setChoosing(false);
                  }}
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
        )}
        <View
          testID="puja-stage"
          style={styles.stage}
          onLayout={(event) => setStage(event.nativeEvent.layout)}
        >
          {deity && shrineWidth > 0 && (
            <Shrine
              size={shrineWidth}
              artKey={deity.artKey}
              offered={shown}
              glow={doneToday || offered.has("aarti")}
            >
              {current?.kind === "aarti" && (
                <AartiCircle
                  size={shrineWidth}
                  rounds={AARTI_ROUNDS}
                  auto={autoAarti}
                  onRound={(round) => {
                    ring();
                    setRounds(round);
                    if (round >= AARTI_ROUNDS) {
                      setPetals((key) => key + 1);
                      offer("aarti");
                    }
                  }}
                />
              )}
            </Shrine>
          )}
        </View>
        <StepDots steps={steps} done={shown} current={current?.kind} />
        {doneToday ? (
          <SanctumNote text={t("prayerDoneToday")} />
        ) : current ? (
          <View style={styles.card}>
            <Txt bold size={15} style={{ color: sanctum.brassLight }}>
              {t("step")} {steps.indexOf(current) + 1} / {steps.length} ·{" "}
              {t(stepName[current.kind])}
            </Txt>
            <Txt
              bold
              size={current.kind === "pranam" ? 18 : 22}
              style={{ color: sanctum.ghee }}
            >
              {current.line[local.language]}
            </Txt>
            <Txt size={17} style={{ color: sanctum.text }}>
              {current.label[local.language]}
            </Txt>
            {current.kind === "aarti" ? (
              <>
                <Txt bold size={18} style={{ color: sanctum.brassLight }}>
                  {t("pujaStepAarti")}: {rounds} / {AARTI_ROUNDS}{" "}
                  {t("aartiRounds")}
                </Txt>
                <Txt size={15} style={{ color: sanctum.textMuted }}>
                  {t("aartiHint")}
                </Txt>
                <BrassButton
                  quiet
                  label={t("aartiAuto")}
                  disabled={autoAarti}
                  onPress={() => setAutoAarti(true)}
                />
              </>
            ) : (
              <BrassButton
                label={t(stepAction[current.kind] ?? "offer")}
                disabled={sending}
                onPress={() => void perform(current)}
              />
            )}
          </View>
        ) : null}
        <EarningNote />
      </View>
      <PetalShower trigger={petals} />
    </SanctumPage>
  );
}

// Six small lamps along the way: lit for each step done.
function StepDots({
  steps,
  done,
  current,
}: {
  steps: PrayerItem[];
  done: ReadonlySet<PujaStep>;
  current?: PujaStep;
}) {
  return (
    <View style={styles.dots} accessible={false}>
      {steps.map((step) => (
        <View
          key={step.id}
          style={[
            styles.dot,
            done.has(step.kind) && styles.dotDone,
            current === step.kind && styles.dotCurrent,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 10, paddingHorizontal: 20, paddingBottom: 16 },
  deityRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  change: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(243, 213, 138, 0.5)",
  },
  chips: { gap: 10, paddingVertical: 4 },
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
  stage: { flex: 1, justifyContent: "center", overflow: "hidden" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 10 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "rgba(243, 213, 138, 0.5)",
  },
  dotDone: { backgroundColor: sanctum.brass, borderColor: sanctum.brassLight },
  dotCurrent: { borderColor: sanctum.ghee, borderWidth: 2.5 },
  card: {
    gap: 8,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "rgba(63, 26, 20, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(243, 213, 138, 0.3)",
  },
});
