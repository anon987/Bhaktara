import { useDialog } from "../../components/Dialog";
import React, { useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, View } from "react-native";
import { Check, Circle, RotateCcw } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  Card,
  Chip,
  Notice,
  Page,
  Progress,
  Row,
  Txt,
} from "../../components/ui";
import { colors } from "../../theme/tokens";
import {
  createTimer,
  formatTime,
  localPracticeDay,
  malaProgress,
  pauseTimer,
  remainingAt,
  startTimer,
} from "../../domain/practice";
export function JaapScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Jaap">) {
  const { t, local, update, catalog } = useApp();
  const showDialog = useDialog();
  const [deity, setDeity] = useState(local.deityId ?? "shiva");
  const { malas, beads } = malaProgress(local.jaapCount);
  const increment = () => {
    const day = localPracticeDay();
    update((state) => {
      const jaapCount = state.jaapCount + 1;
      return {
        ...state,
        jaapCount,
        days:
          jaapCount % 108 === 0
            ? {
                ...state.days,
                [day]: {
                  ...(state.days[day] ?? {
                    jaap: false,
                    meditation: false,
                    prayer: false,
                  }),
                  jaap: true,
                },
              }
            : state.days,
      };
    });
  };
  return (
    <Page title={t("jaap")} subtitle={t("jaapHint")} onBack={navigation.goBack}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {catalog?.deities.map((item) => (
          <Chip
            key={item.id}
            selected={deity === item.id}
            label={item.name[local.language]}
            onPress={() => setDeity(item.id)}
          />
        ))}
      </ScrollView>
      <View style={{ alignItems: "center", paddingVertical: 24 }}>
        <Pressable
          testID="jaap-counter"
          accessibilityRole="button"
          accessibilityLabel={`${t("tap")}, ${local.jaapCount}`}
          onPress={increment}
          style={({ pressed }) => ({
            width: 260,
            height: 260,
            borderRadius: 130,
            borderWidth: 10,
            borderColor: colors.pale,
            backgroundColor: pressed ? colors.pale : colors.surface,
            justifyContent: "center",
            alignItems: "center",
            gap: 3,
          })}
        >
          <Txt bold size={68}>
            {beads}
          </Txt>
          <Txt size={15} muted>
            / 108
          </Txt>
          <Txt bold style={{ color: colors.primary, marginTop: 8 }}>
            {t("tap")}
          </Txt>
        </Pressable>
      </View>
      <Progress value={beads / 108} label={t("jaap")} />
      <Txt bold style={{ textAlign: "center" }}>
        {malas} {t("mala")}
      </Txt>
      <Button
        secondary
        icon={RotateCcw}
        label={t("reset")}
        onPress={() =>
          showDialog(t("resetQuestion"), t("resetHint"), [
            { text: t("cancel"), style: "cancel" },
            {
              text: t("reset"),
              onPress: () => update((state) => ({ ...state, jaapCount: 0 })),
            },
          ])
        }
      />
      <Notice text={t("localOnly")} />
    </Page>
  );
}
export function MeditationScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Meditation">) {
  const { local, t, update } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const remaining = remainingAt(local.timer, now);
  const running = local.timer.endsAt !== null;
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    const listener = AppState.addEventListener("change", () =>
      setNow(Date.now()),
    );
    return () => {
      clearInterval(interval);
      listener.remove();
    };
  }, []);
  return (
    <Page title={t("meditation")} onBack={navigation.goBack}>
      <Txt muted style={{ textAlign: "center" }}>
        {t("timerHint")}
      </Txt>
      <Row style={{ justifyContent: "center", flexWrap: "wrap" }}>
        {[5, 10, 15, 20].map((minutes) => (
          <Chip
            key={minutes}
            label={`${minutes} ${t("minutes")}`}
            selected={local.timer.durationSeconds === minutes * 60}
            onPress={() => {
              if (!running)
                update((state) => ({
                  ...state,
                  timer: createTimer(minutes * 60),
                }));
            }}
          />
        ))}
      </Row>
      <View
        style={{
          alignSelf: "center",
          width: 260,
          height: 260,
          borderRadius: 130,
          borderWidth: 2,
          borderColor: colors.gold,
          backgroundColor: colors.pale,
          alignItems: "center",
          justifyContent: "center",
          marginVertical: 30,
        }}
      >
        <Txt size={59} bold>
          {formatTime(remaining)}
        </Txt>
        <Txt muted>{remaining === 0 ? t("completed") : t("meditation")}</Txt>
      </View>
      <Progress
        label={t("meditation")}
        value={1 - remaining / local.timer.durationSeconds}
      />
      {remaining === 0 && (
        <Txt style={{ textAlign: "center" }}>{t("timerDone")}</Txt>
      )}
      <Button
        label={
          running
            ? t("pause")
            : remaining === local.timer.durationSeconds || remaining === 0
              ? t("start")
              : t("resume")
        }
        onPress={() =>
          update((state) => ({
            ...state,
            timer: running
              ? pauseTimer(state.timer, Date.now())
              : startTimer(state.timer, Date.now()),
          }))
        }
      />
      <Button
        secondary
        label={t("reset")}
        onPress={() =>
          update((state) => ({
            ...state,
            timer: createTimer(state.timer.durationSeconds),
          }))
        }
      />
      <Notice text={t("localOnly")} />
    </Page>
  );
}
export function PrayerScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Prayer">) {
  const { t, local, completeTask } = useApp();
  const done = local.days[localPracticeDay()]?.prayer ?? false;
  const [checked, setChecked] = useState<string[]>(
    done ? ["gratitude", "intention", "reflection"] : [],
  );
  return (
    <Page
      title={t("prayer")}
      subtitle={t("prayerHint")}
      onBack={navigation.goBack}
    >
      {(["gratitude", "intention", "reflection"] as const).map((key) => (
        <Pressable
          key={key}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: checked.includes(key) }}
          onPress={() =>
            setChecked((values) =>
              values.includes(key)
                ? values.filter((value) => value !== key)
                : [...values, key],
            )
          }
        >
          <Card>
            <Row>
              {checked.includes(key) ? (
                <Check size={24} color={colors.green} />
              ) : (
                <Circle size={24} color={colors.muted} />
              )}
              <Txt style={{ flex: 1 }}>{t(key)}</Txt>
            </Row>
          </Card>
        </Pressable>
      ))}
      <Button
        label={done ? t("completed") : t("continue")}
        disabled={checked.length !== 3 || done}
        onPress={() => completeTask("prayer")}
      />
      <Notice text={t("localOnly")} />
    </Page>
  );
}
