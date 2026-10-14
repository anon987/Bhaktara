import React, { useEffect, useState } from "react";
import { Animated, Easing, Modal, StyleSheet, View } from "react-native";
import { Award, Flag, Sparkles } from "lucide-react-native";
import { Txt } from "../../components/ui";
import { useApp } from "../../app/providers/AppProvider";
import { rankNames } from "../../domain/progression";
import { sanctum } from "../../theme/tokens";
import { Diya } from "./art/Diya";
import { PetalShower } from "./art/PetalShower";
import { BrassButton } from "./Sanctum";
import { useProgression } from "./ProgressionProvider";

// Ashirvad: shown after a practice is recorded. One message at a time, large
// type and a shower of petals (the screens ring their own bells); a single
// button closes it.
export function BlessingSheet() {
  const { t, local } = useApp();
  const { blessing, dismissBlessing } = useProgression();
  const [rise] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!blessing) return;
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
    // Play once per blessing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blessing?.key]);
  if (!blessing) return null;
  const { result, kind } = blessing;
  const language = local.language;
  const title =
    kind === "mandir"
      ? t("darshanDone")
      : result.fullSadhana && kind !== "mala"
        ? t("blessFull")
        : kind === "mala"
          ? t("blessMala")
          : kind === "meditation"
            ? t("blessDhyan")
            : t("blessPrayer");
  return (
    <Modal
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissBlessing}
    >
      <View style={styles.backdrop}>
        <PetalShower trigger={blessing.key} count={28} />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              opacity: rise,
              transform: [
                {
                  translateY: rise.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Diya size={96} glow={Math.min(1, result.currentStreak / 21)} />
          <Txt
            bold
            size={28}
            accessibilityRole="header"
            style={{ color: sanctum.text, textAlign: "center" }}
          >
            {title}
          </Txt>
          {result.xpGranted > 0 && (
            <View style={styles.center}>
              <Txt size={16} style={{ color: sanctum.textMuted }}>
                {t("blessEarned")}
              </Txt>
              <Txt bold size={44} style={{ color: sanctum.brassLight }}>
                +{result.xpGranted} {t("points")}
              </Txt>
            </View>
          )}
          {result.currentStreak > 0 && (
            <Txt
              bold
              size={20}
              style={{ color: sanctum.ghee, textAlign: "center" }}
            >
              {t("akhandJyoti")} · {result.currentStreak} {t("streakDays")}
            </Txt>
          )}
          {result.levelUp && (
            <Line icon={Sparkles}>
              {t("reachedLevel")} {result.level}
              {result.rankUp
                ? ` · ${t("newRank")}: ${rankNames[result.rank][language]}`
                : ""}
            </Line>
          )}
          {result.challengesCompleted.map((challenge) => (
            <Line key={challenge.id} icon={Flag}>
              {t("sankalpFulfilled")}: {challenge.title[language]}
            </Line>
          ))}
          {result.badgesUnlocked.map((badge) => (
            <Line key={badge.id} icon={Award}>
              {t("newMilestone")}: {badge.name[language]}
            </Line>
          ))}
          {result.capped && (
            <Txt
              size={14}
              style={{ color: sanctum.textMuted, textAlign: "center" }}
            >
              {t("capped")}
            </Txt>
          )}
          <View style={{ alignSelf: "stretch", marginTop: 6 }}>
            <BrassButton label={t("jaiHo")} onPress={dismissBlessing} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Line({
  icon: Icon,
  children,
}: React.PropsWithChildren<{ icon: typeof Award }>) {
  return (
    <View style={styles.line}>
      <Icon size={24} color={sanctum.brassLight} />
      <Txt bold size={17} style={{ color: sanctum.text, flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(18, 10, 8, 0.82)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    alignItems: "center",
    gap: 12,
    padding: 24,
    borderRadius: 32,
    backgroundColor: sanctum.maroon,
    borderWidth: 2,
    borderColor: sanctum.brass,
  },
  center: { alignItems: "center" },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch",
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(217, 164, 65, 0.14)",
  },
});
