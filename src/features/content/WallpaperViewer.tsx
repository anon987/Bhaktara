import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import {
  ChevronLeft,
  ChevronsUp,
  LucideIcon,
  Smartphone,
  X,
} from "lucide-react-native";
import { useApp } from "../../app/providers/AppProvider";
import { Button, Progress, Txt } from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { useReducedMotion } from "../../components/useReducedMotion";
import { Content } from "../../domain/models";
import { deityWallpapers } from "../../domain/wallpaperFeed";
import { analytics } from "../../services/analytics";
import { resolveMediaUrl } from "../../services/media/config";
import { colors, sanctum } from "../../theme/tokens";
import type { PlaySource } from "../player/playback";
import { SaveActionsController, useSaveActions } from "./useSaveActions";
import { WhatsAppGlyph } from "./WhatsAppGlyph";

const useNativeDriver = Platform.OS !== "web";
export const WHATSAPP_GREEN = "#25D366";
const SWIPE_HINT = "wallpaperSwipe";
const FAB = 64;
// Room the FAB column (button + label) needs on the right of the toast.
export const FAB_COLUMN = 120;

// Full-bleed wallpaper preview: the picture fills the phone edge to edge,
// behind the status and navigation bars. Swipe up for the next wallpaper of
// the same deity (reels-style paging). WhatsApp share (free, D-041) and Set
// wallpaper float bottom-right; Save to gallery (rewarded, D-038) sits in the
// top bar next to the favourite heart. Explore opens it by deity and passes
// that deity's `pages` itself, starting at the first.
export function WallpaperViewer({
  item,
  pages: given,
  source,
  onBack,
}: {
  item: Content;
  pages?: Content[];
  source: PlaySource;
  onBack: () => void;
}) {
  const { catalog, local, ready, t, update } = useApp();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [size, setSize] = useState({
    width: window.width,
    height: window.height,
  });
  // Fixed on opening, so a catalog refresh never moves the page underneath.
  const [pages] = useState(() =>
    given?.length ? given : deityWallpapers(catalog?.content ?? [item], item),
  );
  const [index, setIndex] = useState(0);
  const current = pages[index] ?? item;
  const actions = useSaveActions(current);
  const list = useRef<FlatList<Content>>(null);
  const language = local.language;

  // Doc 13 content_view: each page the user settles on.
  useEffect(() => {
    analytics.track("content_view", {
      content_id: current.id,
      content_type: current.type,
      source,
    });
  }, [current.id, current.type, source]);

  // One-time "swipe up" hint, until the user swipes, taps it or it times out.
  const [hintClosed, setHintClosed] = useState(false);
  const showHint =
    ready &&
    !hintClosed &&
    pages.length > 1 &&
    !local.seenHints.includes(SWIPE_HINT);
  const closeHint = useCallback(() => {
    setHintClosed(true);
    update((state) =>
      state.seenHints.includes(SWIPE_HINT)
        ? state
        : { ...state, seenHints: [...state.seenHints, SWIPE_HINT] },
    );
  }, [update]);
  useEffect(() => {
    if (!showHint) return;
    const timer = setTimeout(closeHint, 7000);
    return () => clearTimeout(timer);
  }, [showHint, closeHint]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (
      width > 0 &&
      height > 0 &&
      (width !== size.width || height !== size.height)
    )
      setSize({ width, height });
  };
  // Keep the settled page in place if the measured height differs.
  useEffect(() => {
    list.current?.scrollToOffset({
      offset: index * size.height,
      animated: false,
    });
    // Only on a size change; paging moves the list itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.height]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(
      pages.length - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.y / size.height)),
    );
    if (next === index) return;
    setIndex(next);
    if (showHint) closeHint();
  };

  const shareDisabled = actions.busy || !actions.shareReady;
  const setDisabled = actions.busy || !actions.mediaReady;
  const toastVisible = actions.phase.name !== "idle";

  return (
    <View style={styles.root} onLayout={onLayout}>
      <StatusBar style="light" />
      <FlatList
        ref={list}
        testID="wallpaper-pages"
        data={pages}
        keyExtractor={(page) => page.id}
        extraData={`${index}:${size.width}x${size.height}:${language}`}
        renderItem={({ item: page, index: position }) => (
          <WallpaperPage
            item={page}
            width={size.width}
            height={size.height}
            // Large files only for the visible page and its neighbours.
            loadLarge={Math.abs(position - index) <= 1}
            label={page.title[language]}
          />
        )}
        getItemLayout={(_, position) => ({
          length: size.height,
          offset: size.height * position,
          index: position,
        })}
        pagingEnabled
        snapToInterval={size.height}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        // Low-memory phones: one page at a time, a neighbour on each side.
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        // A running download stays with the wallpaper it was started for.
        scrollEnabled={pages.length > 1 && !actions.busy}
        onMomentumScrollEnd={settle}
      />

      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
        style={[styles.topShade, { height: insets.top + 110 }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.62)"]}
        style={[styles.bottomShade, { height: insets.bottom + 280 }]}
      />

      <View
        style={[
          styles.topBar,
          {
            top: insets.top + 8,
            left: insets.left + 14,
            right: insets.right + 14,
          },
        ]}
      >
        <RoundButton icon={ChevronLeft} label={t("close")} onPress={onBack} />
      </View>

      {showHint && (
        <SwipeHint
          label={t("swipeForMore")}
          // Above the title and the action buttons, clear of the deity's face.
          bottom={insets.bottom + 290}
          onPress={closeHint}
        />
      )}

      <View
        style={[
          styles.bottomLeft,
          {
            left: insets.left + 18,
            right: insets.right + FAB_COLUMN,
            bottom: insets.bottom + 22,
          },
        ]}
      >
        {/* The image speaks for itself: no name or count, only feedback. */}
        {toastVisible && <Toast actions={actions} />}
      </View>

      <View
        style={[
          styles.fabs,
          { right: insets.right + 14, bottom: insets.bottom + 22 },
        ]}
      >
        {actions.canShare && (
          <Fab
            label={t("shareWhatsApp")}
            color={WHATSAPP_GREEN}
            disabled={shareDisabled}
            onPress={actions.shareToWhatsApp}
          >
            <WhatsAppGlyph size={34} />
          </Fab>
        )}
        {actions.canSetWallpaper && (
          <Fab
            label={t("setWallpaper")}
            color={colors.primary}
            disabled={setDisabled}
            badge={actions.gated ? t("adBadge") : undefined}
            onPress={actions.setWallpaper}
          >
            <Smartphone size={30} color={colors.white} />
          </Fab>
        )}
      </View>
      {actions.permissionSheet}
    </View>
  );
}

// One page: the thumb, blurred, stands in while the phone-sized file loads.
function WallpaperPage({
  item,
  width,
  height,
  loadLarge,
  label,
}: {
  item: Content;
  width: number;
  height: number;
  loadLarge: boolean;
  label: string;
}) {
  // Detail screens load the larger variant; lists stay on thumb (doc 22 §A5).
  const large = (item.media.mobile ?? item.media.poster ?? item.media.thumb)
    .key;
  const thumb = resolveMediaUrl(item.media.thumb.key);
  return (
    <View
      testID={`wallpaper-page-${item.id}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.page, { width, height }]}
    >
      {thumb && (
        <Image
          source={{ uri: thumb }}
          blurRadius={14}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      )}
      {(loadLarge || !thumb) && (
        <View style={StyleSheet.absoluteFill}>
          <DevotionalArt assetKey={large} size="100%" square />
        </View>
      )}
    </View>
  );
}

export function RoundButton({
  icon: Icon,
  label,
  onPress,
  selected,
  disabled,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} · ${badge}` : label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.round,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        size={26}
        color={selected ? sanctum.marigold : colors.white}
        fill={selected ? sanctum.marigold : "none"}
      />
      {badge && <Badge text={badge} />}
    </Pressable>
  );
}

// A large round action with its name underneath on a soft scrim; the whole
// stack is the touch target.
export function Fab({
  label,
  color,
  onPress,
  disabled,
  badge,
  children,
}: React.PropsWithChildren<{
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: string;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={badge}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.fabCircle, { backgroundColor: color }]}>
        {children}
        {badge && <Badge text={badge} />}
      </View>
      <View style={styles.fabLabel}>
        <Txt bold size={13} numberOfLines={2} style={styles.fabText}>
          {label}
        </Txt>
      </View>
    </Pressable>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge} pointerEvents="none">
      <Txt bold size={10} style={styles.badgeText}>
        {text}
      </Txt>
    </View>
  );
}

// Progress, success and errors of Save / Set / Share as a snackbar.
export function Toast({ actions }: { actions: SaveActionsController }) {
  const { t } = useApp();
  const { phase, dismiss } = actions;
  // Good news and "not supported" fade on their own; problems wait for the user.
  useEffect(() => {
    if (phase.name !== "done" && phase.name !== "unavailable") return;
    const timer = setTimeout(dismiss, 4000);
    return () => clearTimeout(timer);
  }, [phase, dismiss]);
  const closable = phase.name !== "working";
  return (
    <View accessibilityLiveRegion="polite" style={styles.toast}>
      <View style={styles.toastRow}>
        <View style={{ flex: 1, gap: 8 }}>
          {phase.name === "working" &&
            (phase.progress === null ? (
              <View style={styles.toastWorking}>
                <ActivityIndicator color={colors.primary} />
                <Txt>{t("savingToPhone")}</Txt>
              </View>
            ) : (
              <>
                <Txt>
                  {`${t("downloading")} · ${Math.round(phase.progress * 100)}%`}
                </Txt>
                <Progress value={phase.progress} label={t("downloading")} />
              </>
            ))}
          {phase.name === "done" && <Txt bold>{t(phase.message)}</Txt>}
          {phase.name === "unavailable" && <Txt>{t("actionUnavailable")}</Txt>}
          {phase.name === "permission" && (
            <Txt>
              {t(
                phase.permission === "storage"
                  ? "storagePermissionDenied"
                  : "systemPermissionDenied",
              )}
            </Txt>
          )}
          {phase.name === "error" && <Txt>{t("saveFailed")}</Txt>}
        </View>
        {closable && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            onPress={dismiss}
            hitSlop={10}
            style={styles.toastClose}
          >
            <X size={22} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {phase.name === "permission" && (
        <Button
          secondary
          label={t("openSettings")}
          onPress={actions.openSettings}
        />
      )}
      {(phase.name === "error" ||
        (phase.name === "permission" && phase.permission === "storage")) && (
        <Button secondary label={t("retry")} onPress={actions.retry} />
      )}
    </View>
  );
}

// A gently rising double chevron with the words, so the gesture is never hidden.
export function SwipeHint({
  label,
  bottom,
  onPress,
}: {
  label: string;
  bottom: number;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const [rise] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rise, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver,
        }),
        Animated.timing(rise, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.quad),
          useNativeDriver,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [rise, reduced]);
  return (
    <View
      pointerEvents="box-none"
      style={[styles.hintLayer, { paddingBottom: bottom }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.hint}
      >
        <Animated.View
          style={{
            transform: [
              {
                translateY: rise.interpolate({
                  inputRange: [0, 1],
                  outputRange: [6, -6],
                }),
              },
            ],
          }}
        >
          <ChevronsUp size={40} color={sanctum.brassLight} />
        </Animated.View>
        <Txt bold size={18} style={styles.hintText}>
          {label}
        </Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: sanctum.night },
  page: { backgroundColor: sanctum.night, overflow: "hidden" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomShade: { position: "absolute", bottom: 0, left: 0, right: 0 },
  topBar: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  round: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.45 },
  bottomLeft: { position: "absolute" },
  fabs: { position: "absolute", alignItems: "center", gap: 18 },
  fab: { alignItems: "center", width: 104, gap: 6 },
  fabCircle: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabLabel: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  fabText: { color: colors.white, textAlign: "center" },
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    backgroundColor: sanctum.brass,
    borderRadius: 999,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: colors.white,
  },
  badgeText: { color: sanctum.night, lineHeight: 15 },
  toast: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: sanctum.brass,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  toastRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  toastWorking: { flexDirection: "row", alignItems: "center", gap: 10 },
  toastClose: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -10,
    marginRight: -8,
  },
  hintLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  hint: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: "rgba(30,17,13,0.62)",
    borderWidth: 1,
    borderColor: "rgba(217,164,65,0.6)",
  },
  hintText: { color: sanctum.text, textAlign: "center" },
});
