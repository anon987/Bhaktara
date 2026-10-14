import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  FlatList,
  Image,
  ImageLoadEventData,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { Lock, Play } from "lucide-react-native";
import { DevotionalArt } from "../../../components/DevotionalArt";
import { Txt } from "../../../components/ui";
import { Language } from "../../../i18n/strings";
import { colors, sanctum } from "../../../theme/tokens";
import { MandirDecor, Murti } from "./decor";
import { Box, murtiBox, templeView, TEMPLE_ASPECT } from "./geometry";

// Where the murti stands on a temple page, as the scene overlay needs it.
export function pageMurtiBox(
  width: number,
  height: number,
  temple: MandirDecor | undefined,
  templeAspect: number | undefined,
  murtiAspect: number | undefined,
): Box {
  const view = templeView(
    width,
    height,
    temple?.aspect ?? templeAspect ?? TEMPLE_ASPECT,
    temple?.stage,
  );
  return murtiBox(view.stage, murtiAspect);
}

const aspectOf = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
  const { width, height } = event.nativeEvent.source ?? {};
  return width && height ? width / height : undefined;
};

// The arrows move the pager directly (no screen re-render first).
export type TempleCarouselHandle = { step: (delta: number) => void };

// A full-width pager of temples (swipe left/right, it snaps to each). The
// chosen deity's murti stands in every temple's sanctum. Every page is
// rendered up front (there are only a few) so neither a swipe nor an arrow
// ever shows an empty page. A locked temple is shown dimmed with a lock and
// an "Unlock with an ad" button.
export const TempleCarousel = forwardRef<
  TempleCarouselHandle,
  React.ComponentProps<typeof TempleCarouselView>
>(function TempleCarousel(props, ref) {
  return <TempleCarouselView {...props} handle={ref} />;
});

function TempleCarouselView({
  width,
  height,
  temples,
  page,
  onPage,
  murti,
  artKey,
  glow,
  locked,
  onUnlock,
  scrollEnabled,
  scrollX,
  templeAspects,
  onTempleAspect,
  murtiAspect,
  onMurtiAspect,
  language,
  unlockLabel,
  lockedLabel,
  hint,
  handle,
}: {
  handle?: React.ForwardedRef<TempleCarouselHandle>;
  width: number;
  height: number;
  temples: MandirDecor[];
  page: number;
  onPage: (index: number) => void;
  murti: Murti | null;
  artKey: string;
  glow: boolean;
  locked: (item: MandirDecor) => boolean;
  onUnlock: (item: MandirDecor) => void;
  scrollEnabled: boolean;
  scrollX: SharedValue<number>;
  templeAspects: Record<string, number>;
  onTempleAspect: (id: string, aspect: number) => void;
  murtiAspect: number | undefined;
  onMurtiAspect: (aspect: number) => void;
  language: Language;
  unlockLabel: string;
  lockedLabel: string;
  hint: string;
}) {
  const list = useRef<FlatList<MandirDecor>>(null);
  // The page the list is showing (set by swipes and by the arrows).
  const shown = useRef(page);
  useEffect(() => {
    if (shown.current === page) return;
    shown.current = page;
    list.current?.scrollToOffset({ offset: page * width, animated: true });
  }, [page, width]);
  // A new width (rotation, first layout) keeps the same page in view. The
  // scroll position starts there too (no scroll event reports a list that
  // opens on a later page).
  useEffect(() => {
    scrollX.set(shown.current * width);
    list.current?.scrollToOffset({
      offset: shown.current * width,
      animated: false,
    });
  }, [width, scrollX]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.set(event.contentOffset.x);
    },
  });
  const last = temples.length - 1;
  // Where an arrow is taking the pager (fast taps add up).
  const target = useRef<number | null>(null);
  const settleIndex = (raw: number) => {
    const index = Math.max(0, Math.min(last, raw));
    if (target.current === index) target.current = null;
    if (index === shown.current) return;
    shown.current = index;
    onPage(index);
  };
  const settle = (offset: number) => settleIndex(Math.round(offset / width));
  useImperativeHandle(handle, () => ({
    step: (delta: number) => {
      const from = target.current ?? shown.current;
      const next = Math.max(0, Math.min(last, from + delta));
      if (next === from) return;
      target.current = next;
      list.current?.scrollToOffset({ offset: next * width, animated: true });
    },
  }));
  // A page is reached when the list rests exactly on it, whether a swipe or
  // an arrow moved it (Android reports no momentum end for an arrow).
  useAnimatedReaction(
    () => {
      if (width <= 0) return -1;
      const x = scrollX.get();
      const i = Math.round(x / width);
      return Math.abs(x - i * width) < 1 ? i : -1;
    },
    (index, previous) => {
      if (index >= 0 && index !== previous) runOnJS(settleIndex)(index);
    },
  );

  const renderItem = useCallback(
    ({ item }: { item: MandirDecor }) => (
      <TemplePage
        item={item}
        width={width}
        height={height}
        templeAspect={templeAspects[item.id]}
        onTempleAspect={onTempleAspect}
        murti={murti}
        murtiAspect={murtiAspect}
        onMurtiAspect={onMurtiAspect}
        artKey={artKey}
        glow={glow}
        locked={locked(item)}
        onUnlock={onUnlock}
        name={item.name[language]}
        unlockLabel={unlockLabel}
        lockedLabel={lockedLabel}
      />
    ),
    [
      width,
      height,
      templeAspects,
      onTempleAspect,
      murti,
      murtiAspect,
      onMurtiAspect,
      artKey,
      glow,
      locked,
      onUnlock,
      language,
      unlockLabel,
      lockedLabel,
    ],
  );

  return (
    <Animated.FlatList
      ref={list}
      testID="temple-carousel"
      accessibilityHint={hint}
      data={temples}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      extraData={renderItem}
      horizontal
      pagingEnabled
      scrollEnabled={scrollEnabled}
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      bounces={false}
      overScrollMode="never"
      getItemLayout={(_, index) => ({
        length: width,
        offset: width * index,
        index,
      })}
      initialScrollIndex={Math.min(page, Math.max(0, temples.length - 1))}
      // Every temple at once: a handful of pages, never a blank one.
      initialNumToRender={temples.length}
      maxToRenderPerBatch={temples.length}
      windowSize={2 * temples.length + 1}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onMomentumScrollEnd={(event) => settle(event.nativeEvent.contentOffset.x)}
      style={{ width, height }}
    />
  );
}

const TemplePage = memo(function TemplePage({
  item,
  width,
  height,
  templeAspect,
  onTempleAspect,
  murti,
  murtiAspect,
  onMurtiAspect,
  artKey,
  glow,
  locked,
  onUnlock,
  name,
  unlockLabel,
  lockedLabel,
}: {
  item: MandirDecor;
  width: number;
  height: number;
  templeAspect: number | undefined;
  onTempleAspect: (id: string, aspect: number) => void;
  murti: Murti | null;
  murtiAspect: number | undefined;
  onMurtiAspect: (aspect: number) => void;
  artKey: string;
  glow: boolean;
  locked: boolean;
  onUnlock: (item: MandirDecor) => void;
  name: string;
  unlockLabel: string;
  lockedLabel: string;
}) {
  const view = templeView(
    width,
    height,
    item.aspect ?? templeAspect ?? TEMPLE_ASPECT,
    item.stage,
  );
  const box = murtiBox(view.stage, murti?.aspect ?? murtiAspect);
  return (
    <View
      style={{ width, height, overflow: "hidden" }}
      // A locked page leaves its unlock button reachable on its own.
      accessible={!locked}
      accessibilityLabel={locked ? `${name}, ${lockedLabel}` : name}
    >
      {/* Images get explicit sizes: a bundled image styled only to fill
          its parent draws at its pixel size on Fabric. */}
      {item.placeholder && (
        <Image
          accessible={false}
          source={item.placeholder}
          resizeMode="stretch"
          fadeDuration={0}
          style={{
            position: "absolute",
            left: view.image.x,
            top: view.image.y,
            width: view.image.width,
            height: view.image.height,
          }}
        />
      )}
      <Image
        accessible={false}
        source={item.image}
        resizeMode="stretch"
        fadeDuration={0}
        onLoad={
          item.aspect
            ? undefined
            : (event) => {
                const aspect = aspectOf(event);
                if (aspect) onTempleAspect(item.id, aspect);
              }
        }
        style={{
          position: "absolute",
          left: view.image.x,
          top: view.image.y,
          width: view.image.width,
          height: view.image.height,
        }}
      />
      {glow && !locked && <Halo box={box} />}
      {murti?.placeholder && (
        <Image
          accessible={false}
          source={murti.placeholder}
          resizeMode="contain"
          fadeDuration={0}
          style={{
            position: "absolute",
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
          }}
        />
      )}
      {murti ? (
        <Image
          accessible={false}
          source={murti.source}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={
            murti.aspect
              ? undefined
              : (event) => {
                  const aspect = aspectOf(event);
                  if (aspect) onMurtiAspect(aspect);
                }
          }
          style={{
            position: "absolute",
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
          }}
        />
      ) : (
        <View
          style={{
            position: "absolute",
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
            overflow: "hidden",
            borderRadius: 12,
          }}
        >
          <DevotionalArt assetKey={artKey} size={box.height} />
        </View>
      )}
      {locked && (
        <View style={styles.veil}>
          <View style={styles.lock}>
            <Lock size={36} color={colors.white} strokeWidth={2.4} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${unlockLabel}: ${name}`}
            onPress={() => onUnlock(item)}
            style={({ pressed }) => [
              styles.unlock,
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
          >
            <Play size={22} color={colors.white} fill={colors.white} />
            <Txt bold size={18} style={styles.unlockText}>
              {unlockLabel}
            </Txt>
          </Pressable>
        </View>
      )}
    </View>
  );
});

// A soft golden light round the murti once the aarti has been done.
function Halo({ box }: { box: Box }) {
  const w = box.width * 1.9;
  const h = box.height * 1.35;
  return (
    <Svg
      width={w}
      height={h}
      style={{
        position: "absolute",
        left: box.x + box.width / 2 - w / 2,
        top: box.y + box.height / 2 - h / 2,
      }}
    >
      <Defs>
        <RadialGradient id="murti-halo" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={sanctum.ghee} stopOpacity={0.55} />
          <Stop offset="1" stopColor={sanctum.flame} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse
        cx={w / 2}
        cy={h / 2}
        rx={w / 2}
        ry={h / 2}
        fill="url(#murti-halo)"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  veil: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(42, 10, 8, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  lock: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(107, 15, 18, 0.85)",
    borderWidth: 2,
    borderColor: colors.haldi,
  },
  unlock: {
    minHeight: 60,
    paddingHorizontal: 24,
    borderRadius: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.haldi,
  },
  unlockText: { color: colors.white },
});
