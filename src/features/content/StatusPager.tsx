import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { ChevronLeft } from "lucide-react-native";
import { useApp } from "../../app/providers/AppProvider";
import { Content } from "../../domain/models";
import { analytics } from "../../services/analytics";
import { sanctum } from "../../theme/tokens";
import type { PlaySource } from "../player/playback";
import { StatusVideo } from "./StatusVideo";
import { useSaveActions } from "./useSaveActions";
import {
  FAB_COLUMN,
  Fab,
  RoundButton,
  SwipeHint,
  Toast,
  WHATSAPP_GREEN,
} from "./WallpaperViewer";
import { WhatsAppGlyph } from "./WhatsAppGlyph";
import { SocialGlyph } from "./SocialGlyph";

const SWIPE_HINT = "statusSwipe";

// Full-bleed status videos of one deity, paged like the wallpaper viewer:
// swipe up for the next. Each page shows its poster first and loads the video
// only on a tap (StatusVideo, doc 22 §A5); leaving a page stops its video.
// Two free shares (D-041), no ads: WhatsApp status above Instagram / Facebook
// story. No titles or counts on screen.
const INSTAGRAM_MAGENTA = "#D62976";
export function StatusPager({
  items,
  source,
  onBack,
}: {
  items: Content[];
  source: PlaySource;
  onBack: () => void;
}) {
  const { local, ready, t, update } = useApp();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [size, setSize] = useState({
    width: window.width,
    height: window.height,
  });
  // Fixed on opening, so a catalog refresh never moves the page underneath.
  const [pages] = useState(items);
  const [index, setIndex] = useState(0);
  const current = pages[index] ?? pages[0];
  const actions = useSaveActions(current);
  const list = useRef<FlatList<Content>>(null);

  // Doc 13 content_view: each page the user settles on.
  useEffect(() => {
    analytics.track("content_view", {
      content_id: current.id,
      content_type: current.type,
      source,
    });
  }, [current.id, current.type, source]);

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

  const chrome = { top: insets.top + 8, right: insets.right + 14 };
  return (
    <View style={styles.root} onLayout={onLayout}>
      <StatusBar style="light" />
      <FlatList
        ref={list}
        testID="status-pages"
        data={pages}
        keyExtractor={(page) => page.id}
        extraData={`${index}:${size.width}x${size.height}`}
        renderItem={({ item: page, index: position }) => (
          <View
            testID={`status-page-${page.id}`}
            style={{ width: size.width, height: size.height }}
          >
            <StatusVideo
              // A page that is scrolled away starts over from its poster, so
              // its player is released and it never plays out of sight.
              key={position === index ? "current" : "away"}
              content={page}
              source={source}
              fullBleed={chrome}
            />
          </View>
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
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        scrollEnabled={pages.length > 1 && !actions.busy}
        onMomentumScrollEnd={settle}
      />

      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
        style={[styles.topShade, { height: insets.top + 90 }]}
      />

      <View style={[styles.back, { top: chrome.top, left: insets.left + 14 }]}>
        <RoundButton icon={ChevronLeft} label={t("close")} onPress={onBack} />
      </View>

      {showHint && (
        <SwipeHint
          label={t("swipeForMoreStatus")}
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
        {actions.phase.name !== "idle" && <Toast actions={actions} />}
      </View>

      <View
        style={[
          styles.fabs,
          { right: insets.right + 14, bottom: insets.bottom + 22 },
        ]}
      >
        {actions.canShare && (
          <Fab
            label={t("statusWhatsApp")}
            color={WHATSAPP_GREEN}
            disabled={actions.busy || !actions.shareReady}
            onPress={actions.shareToWhatsApp}
          >
            <WhatsAppGlyph size={34} />
          </Fab>
        )}
        {actions.canShare && (
          <Fab
            label={t("statusSocial")}
            color={INSTAGRAM_MAGENTA}
            disabled={actions.busy || !actions.shareReady}
            onPress={actions.shareToSocial}
          >
            <SocialGlyph size={32} />
          </Fab>
        )}
      </View>
      {actions.permissionSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: sanctum.night },
  topShade: { position: "absolute", top: 0, left: 0, right: 0 },
  back: { position: "absolute" },
  bottomLeft: { position: "absolute" },
  fabs: { position: "absolute", alignItems: "center", gap: 18 },
});
