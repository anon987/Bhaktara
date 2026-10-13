import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { ChevronLeft } from "lucide-react-native";
import { Txt } from "../../components/ui";
import { useApp } from "../../app/providers/AppProvider";
import { sanctum, shrine } from "../../theme/tokens";
import { Toran } from "./art/Toran";
import { usePracticeFeedback } from "./feedback";
import { PracticeNotice, useProgression } from "./ProgressionProvider";

// The practice screens share one setting: a lamp-lit sanctum at dusk, framed
// by a toran. Large back button and title; content decides its own layout.
export function SanctumPage({
  title,
  subtitle,
  onBack,
  children,
  scroll = false,
}: React.PropsWithChildren<{
  title: string;
  subtitle?: string;
  onBack: () => void;
  scroll?: boolean;
}>) {
  const { t } = useApp();
  usePracticeFeedback();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );
  return (
    <LinearGradient
      colors={[sanctum.maroon, sanctum.night, "#120A08"]}
      locations={[0, 0.55, 1]}
      style={styles.fill}
    >
      <StatusBar style="light" />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.fill}>
        <Toran />
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
          >
            <ChevronLeft size={30} color={sanctum.brassLight} />
          </Pressable>
          <View style={styles.fill}>
            <Txt bold size={28} style={{ color: sanctum.text }}>
              {title}
            </Txt>
            {subtitle ? (
              <Txt size={15} style={{ color: sanctum.textMuted }}>
                {subtitle}
              </Txt>
            ) : null}
          </View>
        </View>
        {body}
      </SafeAreaView>
    </LinearGradient>
  );
}

// A calm, readable line on the ground (never an error-red alarm). `light`
// is for the parchment Prayer and Jaap screens.
export function SanctumNote({
  text,
  light,
}: {
  text: string;
  light?: boolean;
}) {
  return (
    <View
      style={[styles.note, light && styles.noteLight]}
      accessibilityRole="text"
    >
      <Txt
        size={15}
        style={{
          color: light ? shrine.ink : sanctum.text,
          textAlign: "center",
        }}
      >
        {text}
      </Txt>
    </View>
  );
}

export function useNoticeText(notice: PracticeNotice | null) {
  const { t } = useApp();
  if (!notice) return null;
  return notice.kind === "tooShort"
    ? t("tooShort")
    : notice.kind === "offline"
      ? t("offlinePractice")
      : t("practiceError");
}

// A large brass button for the practice screens.
export function BrassButton({
  label,
  onPress,
  quiet,
  disabled,
}: {
  label: string;
  onPress: () => void;
  quiet?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        quiet && styles.quiet,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Txt
        bold
        size={19}
        style={{
          color: quiet ? sanctum.brassLight : sanctum.night,
          textAlign: "center",
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  back: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243, 213, 138, 0.12)",
  },
  note: {
    marginHorizontal: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: "rgba(217, 164, 65, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(243, 213, 138, 0.35)",
  },
  noteLight: {
    backgroundColor: "rgba(255, 248, 236, 0.92)",
    borderColor: shrine.line,
  },
  button: {
    minHeight: 60,
    borderRadius: 30,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: sanctum.brass,
    borderWidth: 1,
    borderColor: sanctum.brassLight,
  },
  quiet: {
    backgroundColor: "transparent",
    borderColor: "rgba(243, 213, 138, 0.5)",
  },
});

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
export function EarningNote({ light }: { light?: boolean }) {
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
  return text ? <SanctumNote text={text} light={light} /> : null;
}
