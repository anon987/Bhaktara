import { useDialog } from "./dialogContext";
import React from "react";
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextProps,
  useWindowDimensions,
  View,
  ViewProps,
  ViewStyle,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { backgrounds } from "./backgrounds";
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
  header,
  background = backgrounds.page,
}: React.PropsWithChildren<{
  title: string;
  subtitle?: string;
  onBack?: () => void;
  scroll?: boolean;
  // Replaces the app bar; scrolls with the page (Home's greeting).
  header?: React.ReactNode;
  // The screen's soft background art.
  background?: ImageSourcePropType;
}>) {
  const { storageError, t, connection } = useApp();
  const insets = useSafeAreaInsets();
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
    <SafeAreaView edges={["left", "right"]} style={styles.page}>
      <Image
        source={background}
        resizeMode="cover"
        accessible={false}
        style={styles.pageBackground}
      />
      {!header && <AppBar title={title} subtitle={subtitle} onBack={onBack} />}
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {header}
          {body}
        </ScrollView>
      ) : (
        <>
          {header}
          {body}
        </>
      )}
      {/* Saffron behind the status bar, so content scrolled under it (Home's
          greeting) never shows through. */}
      <View
        pointerEvents="none"
        style={[styles.statusStrip, { height: insets.top }]}
      />
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
  statusStrip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bhagwa,
  },
  // Explicit size: a bundled image with only absoluteFill draws at its pixel size.
  pageBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  pageContent: {
    paddingHorizontal: 22,
    gap: 20,
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

const SCALLOP = 18;
const DEPTH = SCALLOP / 2;
const FRINGE = DEPTH + 6;

// A jhalar: the scalloped fringe of a mandap canopy, each lobe trimmed in gold
// with a bead at its tip. It continues the bar's saffron below its edge.
export function Jhalar({ color = colors.saffron }: { color?: string }) {
  const { width } = useWindowDimensions();
  const count = Math.ceil(width / SCALLOP);
  let lobes = "M0 0";
  for (let i = 0; i < count; i++)
    lobes += ` A${DEPTH} ${DEPTH} 0 0 0 ${(i + 1) * SCALLOP} 0`;
  return (
    <Svg width={width} height={FRINGE} accessible={false}>
      <Path d={`${lobes} Z`} fill={color} />
      <Path d={lobes} fill="none" stroke={colors.haldi} strokeWidth={1.5} />
      {Array.from({ length: count }, (_, i) => (
        <Circle
          key={i}
          cx={i * SCALLOP + DEPTH}
          cy={DEPTH + 3}
          r={2}
          fill={colors.haldi}
        />
      ))}
    </Svg>
  );
}

// The saffron app bar every page shares: back, title and subtitle in white
// on bhagwa, finished with a jhalar. `children` replaces the title (Home's
// greeting); `fringe={false}` leaves the edge to the screen (Home's toran).
export function AppBar({
  title,
  subtitle,
  onBack,
  children,
  fringe = true,
}: React.PropsWithChildren<{
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  fringe?: boolean;
}>) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View>
      <LinearGradient
        colors={[colors.bhagwa, colors.saffron]}
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 10,
          paddingHorizontal: 16,
        }}
      >
        {children ?? (
          <Row style={{ minHeight: 52, gap: 6 }}>
            {onBack && (
              <IconButton
                icon={ChevronLeft}
                label={t("close")}
                onPress={onBack}
                color={colors.white}
              />
            )}
            <View style={{ flex: 1, paddingLeft: onBack ? 0 : 6 }}>
              <Txt
                bold
                size={24}
                numberOfLines={1}
                accessibilityRole="header"
                style={{ color: colors.white }}
              >
                {title}
              </Txt>
              {subtitle && (
                <Txt
                  size={14}
                  numberOfLines={1}
                  style={{ color: colors.headerText }}
                >
                  {subtitle}
                </Txt>
              )}
            </View>
          </Row>
        )}
      </LinearGradient>
      {fringe && <Jhalar />}
    </View>
  );
}
