import { useDialog } from "./dialogContext";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewProps,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, LucideIcon } from "lucide-react-native";
import { colors, fonts, radii } from "../theme/tokens";
import { useApp } from "../app/providers/AppProvider";
import { StringKey } from "../i18n/strings";
import { CatalogMode } from "../domain/models";
export function Txt({
  bold,
  muted,
  size = 15,
  style,
  ...props
}: TextProps & { bold?: boolean; muted?: boolean; size?: number }) {
  const { local } = useApp();
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily:
            local.language === "hi"
              ? bold
                ? fonts.hiBold
                : fonts.hi
              : bold
                ? fonts.enBold
                : fonts.en,
          fontSize: size,
          lineHeight: Math.ceil(size * 1.55),
          color: muted ? colors.muted : colors.ink,
        },
        style,
      ]}
    />
  );
}
export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]} />;
}
export function Row({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.row, style]} />;
}
export function IconButton({
  icon: Icon,
  label,
  onPress,
  selected,
  color = colors.ink,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  selected?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Icon size={22} color={color} fill={selected ? color : "none"} />
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  secondary,
  icon: Icon,
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  icon?: LucideIcon;
  style?: ViewStyle;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label || undefined}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        style,
        pressed && styles.pressed,
        disabled && { opacity: 0.5 },
      ]}
    >
      {Icon && (
        <Icon size={19} color={secondary ? colors.primary : colors.white} />
      )}
      <Txt
        bold
        style={{
          color: secondary ? colors.primary : colors.white,
          textAlign: "center",
          flexShrink: 1,
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: colors.dark, borderColor: colors.dark },
        pressed && styles.pressed,
      ]}
    >
      <Txt
        size={13}
        bold
        style={{ color: selected ? colors.white : colors.muted }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <Row style={{ justifyContent: "space-between", marginTop: 8 }}>
      <Txt bold size={21} style={{ flex: 1 }}>
        {title}
      </Txt>
      {action && onPress && (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={styles.link}
        >
          <Txt size={13} bold style={{ color: colors.primary }}>
            {action}
          </Txt>
          <ChevronRight size={16} color={colors.primary} />
        </Pressable>
      )}
    </Row>
  );
}
export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(Math.max(0, Math.min(1, value)) * 100),
      }}
      style={styles.track}
    >
      <View
        style={[
          styles.fill,
          { width: `${Math.max(0, Math.min(1, value)) * 100}%` },
        ]}
      />
    </View>
  );
}
export function Page({
  children,
  title,
  subtitle,
  onBack,
  scroll = true,
}: React.PropsWithChildren<{
  title: string;
  subtitle?: string;
  onBack?: () => void;
  scroll?: boolean;
}>) {
  const { storageError, t, connection } = useApp();
  const body = (
    <View style={[styles.pageContent, !scroll && { flex: 1 }]}>
      {storageError && <Notice text={t("storageError")} />}
      {connection === "emulator" && <Notice text={t("emulatorConnected")} />}
      {__DEV__ && connection === "cloud" && (
        <Notice text={t("cloudConnected")} />
      )}
      {connection === "error" && <Notice text={t("backendError")} />}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.page}>
      <Row style={styles.header}>
        {onBack && (
          <IconButton icon={ChevronLeft} label={t("close")} onPress={onBack} />
        )}
        <View style={{ flex: 1 }}>
          <Txt bold size={28}>
            {title}
          </Txt>
          {subtitle && (
            <Txt muted size={13}>
              {subtitle}
            </Txt>
          )}
        </View>
      </Row>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
export function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Txt muted size={12}>
        {text}
      </Txt>
    </View>
  );
}
// Defaults to the catalog state; screens with their own load (e.g. the Home
// feed) pass `mode` and `onRetry` to reuse the same states.
export function DataBoundary({
  children,
  mode,
  onRetry,
  emptyText = "noResults",
}: React.PropsWithChildren<{
  mode?: CatalogMode;
  onRetry?: () => void;
  emptyText?: StringKey;
}>) {
  const app = useApp();
  const { t } = app;
  const catalogMode = mode ?? app.catalogMode;
  const retry = onRetry ?? app.retry;
  if (catalogMode === "loading")
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.primary} />
        <Txt muted>{t("loading")}</Txt>
      </View>
    );
  if (catalogMode === "error")
    return (
      <Card style={styles.state}>
        <Txt bold>{t("error")}</Txt>
        <Button label={t("retry")} onPress={retry} />
      </Card>
    );
  if (catalogMode === "empty")
    return (
      <Card style={styles.state}>
        <Txt bold>{t(emptyText)}</Txt>
        <Button secondary label={t("retry")} onPress={retry} />
      </Card>
    );
  return (
    <>
      {catalogMode === "offline" && <Notice text={t("offline")} />}
      {children}
    </>
  );
}
export function useUnavailable() {
  const { t } = useApp();
  const showDialog = useDialog();
  return (key: StringKey) => showDialog(t("notConnected"), t(key));
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  pageContent: {
    paddingHorizontal: 22,
    gap: 20,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 20,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  button: {
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondary: { backgroundColor: colors.pale },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.72 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  link: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 2 },
  track: {
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.saffron },
  notice: { backgroundColor: colors.pale, borderRadius: 12, padding: 12 },
  state: { padding: 30, gap: 18, alignItems: "center" },
});
