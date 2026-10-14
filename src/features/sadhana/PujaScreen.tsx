import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  interpolateColor,
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  RotateCcw,
  Sparkles,
} from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { useReducedMotion } from "../../components/useReducedMotion";
import {
  BhogKind,
  GarlandKind,
  offeringsFor,
  TrayItem,
  trayItems,
} from "../../domain/puja";
import { requiredPrayerIds } from "../../domain/progression";
import { colors, shrine } from "../../theme/tokens";
import { noVisuals } from "../../domain/visuals";
import { usePlayer } from "../player/PlayerProvider";
import { PetalShower } from "./art/PetalShower";
import { MandirDecor, templeAfterSwipe } from "./decor/decor";
import { DecorChooser } from "./decor/DecorChooser";
import { DecorLayer } from "./decor/DecorLayer";
import {
  pageMurtiBox,
  TempleCarousel,
  TempleCarouselHandle,
} from "./decor/TempleCarousel";
import { UnlockSheet } from "./decor/UnlockSheet";
import { useMandirDecor } from "./decor/useMandirDecor";
import { beadTick, malaPulse, useDecorSound, useSound } from "./feedback";
import { useProgression } from "./ProgressionProvider";
import {
  FLOWER_LIMIT,
  HandItem,
  PlacedFlower,
  PujaScene,
} from "./puja/PujaScene";
import { Drawer, PujaTray } from "./puja/PujaTray";
import { EarningNote } from "./Sanctum";
import { FlankLines, SerifText } from "./shrine/Ornaments";
import { ShrinePage } from "./shrine/ShrinePage";

// Incense on the stand burns this long after the dhoop is offered, then
// rests (and the scene stops animating its smoke).
const INCENSE_BURN_MS = 60_000;

// Prarthana as a puja before the chosen deity (D-053), performed from a tray
// of animated offerings (D-054) in a mandir the devotee decorates: swipe to
// change the temple (the deity's murti stands in its sanctum), choose lights
// and a bell, offer flowers. Some decor is free, the rest unlocks with a
// rewarded ad (all free while rewarded ads are off). The next traditional
// item glows; everything can be used at any time and as often as the heart
// wishes. The day's prayer is recorded once the required offerings
// (flowers, dhoop, bhog, aarti, shankh) have all been made.
export function PrayerScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Prayer">) {
  const { t, local, update, catalog, searchContent } = useApp();
  const { sadhana, offerPrayer } = useProgression();
  const player = usePlayer();
  const play = useSound();
  const playDecor = useDecorSound();
  const reduced = useReducedMotion();
  const language = local.language;
  const deities = catalog?.deities ?? [];
  const deity = deities.find((item) => item.id === local.deityId) ?? deities[0];
  const offerings = offeringsFor(deity?.id);
  const visuals = catalog?.visuals ?? noVisuals;
  const required = requiredPrayerIds(sadhana) as TrayItem[];
  const decor = useMandirDecor(deity);

  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [choosing, setChoosing] = useState(false);
  const [done, setDone] = useState<ReadonlySet<TrayItem>>(new Set());
  const [flowers, setFlowers] = useState<PlacedFlower[]>([]);
  const [garland, setGarland] = useState<GarlandKind | null>(null);
  const [bhog, setBhog] = useState<BhogKind[]>([]);
  const [tilak, setTilak] = useState(false);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [panel, setPanel] = useState<"light" | "bell" | null>(null);
  const [hand, setHand] = useState<HandItem | null>(null);
  const [placed, setPlaced] = useState<ReadonlySet<HandItem>>(new Set());
  const [incenseBurning, setIncenseBurning] = useState(false);
  const [waterKey, setWaterKey] = useState(0);
  const [shankhKey, setShankhKey] = useState(0);
  const [bellKey, setBellKey] = useState(0);
  const [petals, setPetals] = useState(0);
  const [tapKeys, setTapKeys] = useState<Partial<Record<TrayItem, number>>>({});
  const flowerId = useRef(0);
  const startedAarti = useRef(false);

  // ---- The temple pager. The page in view; a locked temple can be looked
  // at but only becomes the saved temple once unlocked.
  const scrollX = useSharedValue(0);
  const carousel = useRef<TempleCarouselHandle>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const shownTemple =
    (pageId && decor.temples.find((item) => item.id === pageId)) ||
    decor.temple;
  const page = Math.max(
    0,
    decor.temples.findIndex((item) => item.id === shownTemple?.id),
  );
  const pageLocked = shownTemple ? decor.locked(shownTemple) : false;
  const savedTemple = local.mandir.templeId;
  const { chooseTemple } = decor;
  const onPage = (index: number) => {
    const item = decor.temples[index];
    if (!item) return;
    setPageId(item.id);
    const next = templeAfterSwipe(savedTemple, item, decor.locked(item));
    if (next && next !== savedTemple) chooseTemple(next);
  };
  // Remote images report their size once loaded.
  const [templeAspects, setTempleAspects] = useState<Record<string, number>>(
    {},
  );
  const onTempleAspect = useCallback(
    (id: string, aspect: number) =>
      setTempleAspects((known) =>
        known[id] === aspect ? known : { ...known, [id]: aspect },
      ),
    [],
  );
  const [murtiMeasured, setMurtiMeasured] = useState<{
    deityId: string;
    aspect: number;
  } | null>(null);
  const murtiAspect =
    decor.murti?.aspect ??
    (murtiMeasured && murtiMeasured.deityId === deity?.id
      ? murtiMeasured.aspect
      : undefined);
  const deityId = deity?.id;
  const onMurtiAspect = useCallback(
    (aspect: number) => {
      if (deityId) setMurtiMeasured({ deityId, aspect });
    },
    [deityId],
  );

  // ---- Unlocking: a plain sheet, one rewarded ad, then the action.
  const [unlocking, setUnlocking] = useState<{
    item: MandirDecor;
    then: () => void;
  } | null>(null);
  const [adRunning, setAdRunning] = useState(false);
  const { unlock } = decor;
  const watchAd = async () => {
    if (!unlocking || adRunning) return;
    setAdRunning(true);
    const ok = await unlock(unlocking.item);
    setAdRunning(false);
    setUnlocking(null);
    if (ok) unlocking.then();
  };
  const withUnlock = (item: MandirDecor, action: () => void) => {
    if (decor.locked(item)) setUnlocking({ item, then: action });
    else action();
  };
  const onUnlockTemple = useCallback(
    (item: MandirDecor) =>
      setUnlocking({ item, then: () => chooseTemple(item.id) }),
    [chooseTemple],
  );

  // The phone's Back closes what is open (the unlock sheet, a chooser, the
  // offering drawer, the deity list) before it leaves the screen.
  const overlayOpen = !!unlocking || !!panel || !!drawer || choosing;
  useEffect(() => {
    if (!overlayOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (unlocking) {
        if (!adRunning) setUnlocking(null);
      } else if (panel) setPanel(null);
      else if (drawer) setDrawer(null);
      else setChoosing(false);
      return true;
    });
    return () => sub.remove();
  }, [overlayOpen, unlocking, adRunning, panel, drawer]);

  // Offerings made in this visit. The day's prayer is recorded the moment
  // the last required one is made (the server credits it once per day).
  const doneRef = useRef<ReadonlySet<TrayItem>>(new Set());
  const recordedRef = useRef(false);
  const mark = (item: TrayItem) => {
    if (doneRef.current.has(item)) return;
    const next = new Set([...doneRef.current, item]);
    doneRef.current = next;
    setDone(next);
    if (!recordedRef.current && required.every((id) => next.has(id))) {
      recordedRef.current = true;
      setPetals((key) => key + 1);
      malaPulse();
      void offerPrayer(required);
    }
  };
  const tapped = (item: TrayItem) =>
    setTapKeys((keys) => ({ ...keys, [item]: (keys[item] ?? 0) + 1 }));

  // The chosen bell's own sound (the hand ghanti when it has none), and the
  // bell over the temple swings.
  const bell = decor.bell;
  const ring = (item: MandirDecor | null = bell) => {
    if (item?.sound) playDecor(item.id, item.sound);
    else play("ghanti");
    setBellKey((key) => key + 1);
  };

  // The incense on the stand burns out after a while.
  useEffect(() => {
    if (!incenseBurning) return;
    const handle = setTimeout(() => setIncenseBurning(false), INCENSE_BURN_MS);
    return () => clearTimeout(handle);
  }, [incenseBurning]);

  // The deity's aarti, played during the lamp, stops when the puja is left.
  const close = player.close;
  useEffect(
    () => () => {
      if (startedAarti.current) close();
    },
    [close],
  );
  const startAarti = () => {
    if (!deity || startedAarti.current || player.playing) return;
    searchContent({ type: "AARTI", deityId: deity.id, limit: 1 })
      .then(({ items }) => {
        if (!items[0]) return;
        startedAarti.current = true;
        player.load(items[0], "mandir");
      })
      .catch(() => undefined);
  };

  const onItem = (item: TrayItem) => {
    tapped(item);
    beadTick();
    setPanel(null);
    switch (item) {
      case "kalash":
        setWaterKey((key) => key + 1);
        mark(item);
        break;
      case "ghanti":
        ring();
        mark(item);
        break;
      case "chandan":
        setTilak(true);
        mark(item);
        break;
      case "pushp":
        setDrawer((current) =>
          current?.item === "pushp"
            ? null
            : {
                item: "pushp",
                flowers: decor.flowers,
                garland: offerings.garland,
              },
        );
        break;
      case "naivedya":
        setDrawer((current) =>
          current?.item === "naivedya"
            ? null
            : { item: "naivedya", bhog: offerings.bhog },
        );
        break;
      case "dhoop":
      case "deep":
        if (hand) break;
        setDrawer(null);
        setHand(item);
        if (item === "deep") startAarti();
        break;
      case "shankh":
        play("shankh");
        setShankhKey((key) => key + 1);
        mark(item);
        break;
    }
  };

  const offerFlower = (item: MandirDecor) => {
    beadTick();
    // Read the ID now: the updater may run after later taps.
    const id = (flowerId.current += 1);
    setFlowers((values) =>
      [
        ...values,
        {
          id,
          decorId: item.id,
          image: item.image,
          ...(item.flowerKind ? { kind: item.flowerKind } : {}),
        },
      ].slice(-FLOWER_LIMIT),
    );
    mark("pushp");
  };

  const togglePanel = (which: "light" | "bell") => {
    setDrawer(null);
    setPanel((current) => (current === which ? null : which));
  };

  // Clear the altar and start the offerings again (the day's prayer, once
  // recorded, stays recorded).
  const clearAltar = () => {
    setDone(new Set());
    setFlowers([]);
    setGarland(null);
    setBhog([]);
    setTilak(false);
    setDrawer(null);
    setHand(null);
    setPlaced(new Set());
    setIncenseBurning(false);
    doneRef.current = new Set();
    recordedRef.current = false;
  };
  const changeDeity = (id: string) => {
    update((state) => ({ ...state, deityId: id }));
    setChoosing(false);
    // A different deity takes different offerings: begin afresh.
    clearAltar();
  };

  const next = trayItems.find((item) => !done.has(item)) ?? null;
  const lit = new Set<TrayItem>();
  if (hand === "dhoop" || placed.has("dhoop")) lit.add("dhoop");
  if (hand === "deep" || placed.has("deep")) lit.add("deep");

  const murti =
    stage.width > 0 && shownTemple
      ? pageMurtiBox(
          stage.width,
          stage.height,
          shownTemple,
          templeAspects[shownTemple.id],
          murtiAspect,
        )
      : null;
  const decorLabels = {
    ad: t("adBadge"),
    free: t("freeBadge"),
    close: t("close"),
    locked: t("lockedDecor"),
  };

  return (
    <ShrinePage
      title={t("prarthanaShort")}
      background="prayerBackground"
      onBack={navigation.goBack}
    >
      <View style={styles.body}>
        {deity && (
          <View style={styles.deityBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("chooseDeity")}: ${deity.name[language]}`}
              accessibilityState={{ expanded: choosing }}
              disabled={deities.length < 2}
              onPress={() => setChoosing((value) => !value)}
              style={({ pressed }) => [
                styles.picker,
                pressed && { opacity: 0.85 },
              ]}
            >
              <SerifText size={20}>{deity.name[language]}</SerifText>
              {deities.length > 1 &&
                (choosing ? (
                  <ChevronUp size={20} color={shrine.maroon} />
                ) : (
                  <ChevronDown size={20} color={shrine.maroon} />
                ))}
            </Pressable>
            {choosing && (
              <View style={styles.menu} accessibilityRole="menu">
                <ScrollView style={{ maxHeight: 280 }}>
                  {deities.map((item) => {
                    const selected = item.id === deity.id;
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="menuitem"
                        accessibilityState={{ selected }}
                        onPress={() => changeDeity(item.id)}
                        style={[
                          styles.menuItem,
                          selected && styles.menuItemSelected,
                        ]}
                      >
                        <SerifText size={18} bold={selected}>
                          {item.name[language]}
                        </SerifText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        )}
        <View
          testID="puja-stage"
          style={styles.stage}
          onLayout={(event) => setStage(event.nativeEvent.layout)}
        >
          {deity && stage.width > 0 && shownTemple && murti && (
            <>
              <TempleCarousel
                ref={carousel}
                width={stage.width}
                height={stage.height}
                temples={decor.temples}
                page={page}
                onPage={onPage}
                murti={decor.murti}
                artKey={deity.artKey}
                glow={done.has("deep")}
                locked={decor.locked}
                onUnlock={onUnlockTemple}
                scrollEnabled={!hand}
                scrollX={scrollX}
                templeAspects={templeAspects}
                onTempleAspect={onTempleAspect}
                murtiAspect={murtiAspect}
                onMurtiAspect={onMurtiAspect}
                language={language}
                unlockLabel={t("unlockWithAd")}
                lockedLabel={t("lockedDecor")}
                hint={t("swipeTemple")}
              />
              <DecorLayer
                width={stage.width}
                height={stage.height}
                light={decor.light}
                bell={bell}
                ringKey={bellKey}
                reduced={reduced}
              />
              <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                <PujaScene
                  width={stage.width}
                  height={stage.height}
                  murti={murti}
                  pageWidth={stage.width}
                  page={page}
                  scrollX={scrollX}
                  hidden={pageLocked}
                  drawnDeity={!decor.murti}
                  visuals={visuals}
                  offerings={offerings}
                  flowers={flowers}
                  garland={garland}
                  bhog={bhog}
                  tilak={tilak}
                  dhoopPlaced={placed.has("dhoop")}
                  deepPlaced={placed.has("deep")}
                  incenseBurning={incenseBurning}
                  hand={hand}
                  waterKey={waterKey}
                  shankhKey={shankhKey}
                  onHandDone={(item) => {
                    setHand(null);
                    setPlaced((values) => new Set([...values, item]));
                    if (item === "dhoop") setIncenseBurning(true);
                    mark(item);
                  }}
                  onAartiPulse={() => ring()}
                />
              </View>
              {!hand && page > 0 && (
                <Arrow
                  side="left"
                  label={t("previousTemple")}
                  onPress={() => carousel.current?.step(-1)}
                />
              )}
              {!hand && page < decor.temples.length - 1 && (
                <Arrow
                  side="right"
                  label={t("nextTemple")}
                  onPress={() => carousel.current?.step(1)}
                />
              )}
              {!hand && (
                <>
                  <DecorButton
                    side="left"
                    label={t("decorLights")}
                    image={decor.light?.image}
                    icon={<Sparkles size={26} color={shrine.maroon} />}
                    selected={panel === "light"}
                    onPress={() => togglePanel("light")}
                  />
                  <DecorButton
                    side="right"
                    label={t("decorBell")}
                    image={bell?.image}
                    icon={<Bell size={26} color={shrine.maroon} />}
                    selected={panel === "bell"}
                    onPress={() => togglePanel("bell")}
                  />
                  <PageDots
                    names={decor.temples.map((item) => item.name[language])}
                    scrollX={scrollX}
                    width={stage.width}
                  />
                </>
              )}
              {panel && !hand && (
                <View style={styles.panel}>
                  {panel === "light" ? (
                    <DecorChooser
                      testID="light-chooser"
                      items={decor.lights}
                      selectedId={decor.light?.id ?? null}
                      locked={decor.locked}
                      adsOn={decor.adsOn}
                      language={language}
                      labels={decorLabels}
                      none={t("noLights")}
                      onChoose={(item) => {
                        beadTick();
                        if (!item) decor.chooseLight(null);
                        else withUnlock(item, () => decor.chooseLight(item.id));
                      }}
                      onClose={() => setPanel(null)}
                    />
                  ) : (
                    <DecorChooser
                      testID="bell-chooser"
                      items={decor.bells}
                      selectedId={bell?.id ?? null}
                      locked={decor.locked}
                      adsOn={decor.adsOn}
                      language={language}
                      labels={decorLabels}
                      onChoose={(item) => {
                        if (!item) return;
                        beadTick();
                        withUnlock(item, () => {
                          decor.chooseBell(item.id);
                          // Hear it as it is chosen.
                          ring(item);
                        });
                      }}
                      onClose={() => setPanel(null)}
                    />
                  )}
                </View>
              )}
            </>
          )}
        </View>
        <EarningNote light />
        <PujaTray
          language={language}
          done={done}
          next={hand ? null : next}
          lit={lit}
          tapKeys={tapKeys}
          drawer={drawer}
          visuals={visuals}
          icons={bell ? { ghanti: bell.image } : {}}
          locked={decor.locked}
          lockedLabel={t("lockedDecor")}
          onItem={onItem}
          onFlower={(item) => withUnlock(item, () => offerFlower(item))}
          onGarland={(kind) => {
            beadTick();
            setGarland(kind);
            mark("pushp");
          }}
          onBhog={(kind) => {
            beadTick();
            setBhog((values) => [
              ...values.filter((value) => value !== kind),
              kind,
            ]);
            mark("naivedya");
          }}
        />
        <FlankLines>
          <Pressable
            accessibilityRole="button"
            onPress={clearAltar}
            hitSlop={10}
            style={({ pressed }) => [styles.reset, pressed && { opacity: 0.6 }]}
          >
            <RotateCcw size={20} color={shrine.maroon} />
            <SerifText size={17} bold={false}>
              {t("resetOfferings")}
            </SerifText>
          </Pressable>
        </FlankLines>
      </View>
      <PetalShower trigger={petals} count={30} />
      <UnlockSheet
        item={unlocking?.item ?? null}
        language={language}
        busy={adRunning}
        labels={{
          watch: t("watchToUnlock"),
          notNow: t("notNow"),
          opening: t("unlockOpening"),
        }}
        onWatch={() => void watchAd()}
        onClose={() => setUnlocking(null)}
      />
    </ShrinePage>
  );
}

// Big round buttons at the scene's edges to step through the temples.
function Arrow({
  side,
  label,
  onPress,
}: {
  side: "left" | "right";
  label: string;
  onPress: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.arrow,
        side === "left" ? { left: 6 } : { right: 6 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon size={32} color={shrine.maroon} strokeWidth={2.6} />
    </Pressable>
  );
}

// Opens the lights or bell chooser; shows the current choice.
function DecorButton({
  side,
  label,
  image,
  icon,
  selected,
  onPress,
}: {
  side: "left" | "right";
  label: string;
  image?: MandirDecor["image"];
  icon: React.ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.decorButton,
        side === "left" ? { left: 8 } : { right: 8 },
        selected && styles.decorButtonSelected,
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      {image ? (
        <Image
          accessible={false}
          source={image}
          resizeMode="contain"
          fadeDuration={0}
          style={{ width: 34, height: 34 }}
        />
      ) : (
        icon
      )}
      <Txt bold size={16} style={{ color: shrine.maroon, lineHeight: 22 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

// Which temple is shown: a dot per temple and its name. Both follow the
// pager as it moves (finger or arrow), not only once it stops.
function PageDots({
  names,
  scrollX,
  width,
}: {
  names: string[];
  scrollX: SharedValue<number>;
  width: number;
}) {
  const [index, setIndex] = useState(() =>
    width > 0 ? Math.round(scrollX.get() / width) : 0,
  );
  useAnimatedReaction(
    () => (width > 0 ? Math.round(scrollX.get() / width) : 0),
    (next, previous) => {
      if (next !== previous) runOnJS(setIndex)(next);
    },
  );
  if (names.length < 2) return null;
  const name = names[Math.max(0, Math.min(names.length - 1, index))];
  return (
    <View style={styles.dots} pointerEvents="none">
      <View style={styles.dotRow}>
        {names.map((_, i) => (
          <Dot key={i} i={i} scrollX={scrollX} width={width} />
        ))}
      </View>
      <Txt
        size={13}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: shrine.maroon, lineHeight: 17 }}
      >
        {name}
      </Txt>
    </View>
  );
}

// Grows and reddens as its temple comes into view.
function Dot({
  i,
  scrollX,
  width,
}: {
  i: number;
  scrollX: SharedValue<number>;
  width: number;
}) {
  const style = useAnimatedStyle(() => {
    const near =
      width > 0
        ? Math.max(0, 1 - Math.abs(scrollX.get() / width - i))
        : i === 0
          ? 1
          : 0;
    return {
      width: 8 + 10 * near,
      backgroundColor: interpolateColor(
        near,
        [0, 1],
        ["rgba(107, 15, 18, 0.25)", colors.primary],
      ),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  deityBar: { alignItems: "center", zIndex: 3, marginTop: 4 },
  picker: {
    minHeight: 56,
    minWidth: 220,
    paddingHorizontal: 22,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: shrine.ivory,
    borderWidth: 1.5,
    borderColor: shrine.line,
  },
  menu: {
    position: "absolute",
    top: 62,
    minWidth: 220,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: shrine.ivory,
    borderWidth: 1,
    borderColor: shrine.line,
    shadowColor: shrine.goldDeep,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuItem: { minHeight: 56, justifyContent: "center", paddingHorizontal: 20 },
  menuItemSelected: { backgroundColor: "rgba(255, 153, 51, 0.18)" },
  // Full width: the temples run edge to edge.
  stage: { flex: 1, overflow: "hidden", marginHorizontal: -14 },
  arrow: {
    position: "absolute",
    top: "42%",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 248, 236, 0.82)",
    borderWidth: 1.5,
    borderColor: colors.haldi,
  },
  decorButton: {
    position: "absolute",
    bottom: 8,
    minHeight: 56,
    minWidth: 96,
    paddingHorizontal: 12,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255, 248, 236, 0.92)",
    borderWidth: 1.5,
    borderColor: colors.haldi,
  },
  decorButtonSelected: {
    borderColor: colors.saffron,
    borderWidth: 2.5,
    backgroundColor: shrine.ivory,
  },
  dots: {
    position: "absolute",
    bottom: 10,
    left: "28%",
    right: "28%",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255, 248, 236, 0.85)",
  },
  dotRow: { flexDirection: "row", gap: 6, paddingTop: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(107, 15, 18, 0.25)",
  },
  panel: { position: "absolute", left: 8, right: 8, bottom: 72 },
  reset: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
  },
});
