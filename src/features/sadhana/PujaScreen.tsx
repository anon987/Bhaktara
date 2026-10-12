import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  BhogKind,
  FlowerKind,
  GarlandKind,
  offeringsFor,
  TrayItem,
  trayItems,
} from "../../domain/puja";
import { requiredPrayerIds } from "../../domain/progression";
import { shrine } from "../../theme/tokens";
import { noVisuals } from "../../domain/visuals";
import { usePlayer } from "../player/PlayerProvider";
import { PetalShower } from "./art/PetalShower";
import { beadTick, malaPulse, useSound } from "./feedback";
import { useProgression } from "./ProgressionProvider";
import { FLOWER_LIMIT, HandItem, PlacedFlower, PujaScene } from "./puja/PujaScene";
import { Drawer, PujaTray } from "./puja/PujaTray";
import { EarningNote } from "./Sanctum";
import { FlankLines, LotusDivider, SerifText } from "./shrine/Ornaments";
import { ShrinePage } from "./shrine/ShrinePage";

// Prarthana as a puja before the chosen deity (D-053), performed from a tray
// of animated offerings (D-054) in a sunlit marble shrine (D-057). The next
// traditional item glows; everything can be used at any time and as often
// as the heart wishes. The day's prayer is recorded once the required
// offerings (flowers, dhoop, bhog, aarti, shankh) have all been made.
export function PrayerScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Prayer">) {
  const { t, local, update, catalog, searchContent } = useApp();
  const { sadhana, offerPrayer } = useProgression();
  const player = usePlayer();
  const play = useSound();
  const deities = catalog?.deities ?? [];
  const deity = deities.find((item) => item.id === local.deityId) ?? deities[0];
  const offerings = offeringsFor(deity?.id);
  const visuals = catalog?.visuals ?? noVisuals;
  const required = requiredPrayerIds(sadhana) as TrayItem[];

  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [choosing, setChoosing] = useState(false);
  const [done, setDone] = useState<ReadonlySet<TrayItem>>(new Set());
  const [flowers, setFlowers] = useState<PlacedFlower[]>([]);
  const [garland, setGarland] = useState<GarlandKind | null>(null);
  const [bhog, setBhog] = useState<BhogKind[]>([]);
  const [tilak, setTilak] = useState(false);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [hand, setHand] = useState<HandItem | null>(null);
  const [placed, setPlaced] = useState<ReadonlySet<HandItem>>(new Set());
  const [waterKey, setWaterKey] = useState(0);
  const [shankhKey, setShankhKey] = useState(0);
  const [petals, setPetals] = useState(0);
  const [tapKeys, setTapKeys] = useState<Partial<Record<TrayItem, number>>>({});
  const flowerId = useRef(0);
  const startedAarti = useRef(false);

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
    switch (item) {
      case "kalash":
        setWaterKey((key) => key + 1);
        mark(item);
        break;
      case "ghanti":
        play("ghanti");
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
                flowers: offerings.flowers,
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
              accessibilityLabel={`${t("chooseDeity")}: ${deity.name[local.language]}`}
              accessibilityState={{ expanded: choosing }}
              disabled={deities.length < 2}
              onPress={() => setChoosing((value) => !value)}
              style={({ pressed }) => [
                styles.picker,
                pressed && { opacity: 0.85 },
              ]}
            >
              <SerifText size={20}>{deity.name[local.language]}</SerifText>
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
                          {item.name[local.language]}
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
          {deity && stage.width > 0 && (
            <PujaScene
              width={stage.width}
              height={stage.height}
              artKey={deity.artKey}
              shrineKey={deity.shrineKey}
              visuals={visuals}
              offerings={offerings}
              flowers={flowers}
              garland={garland}
              bhog={bhog}
              tilak={tilak}
              dhoopPlaced={placed.has("dhoop")}
              deepPlaced={placed.has("deep")}
              hand={hand}
              waterKey={waterKey}
              shankhKey={shankhKey}
              glow={done.has("deep")}
              onHandDone={(item) => {
                setHand(null);
                setPlaced((values) => new Set([...values, item]));
                mark(item);
              }}
              onAartiPulse={() => play("ghanti")}
            />
          )}
        </View>
        <EarningNote light />
        <LotusDivider width={260} assetKey={visuals.scenes.divider} />
        <SerifText size={22} accessibilityRole="header">
          {t("chooseOffering")}
        </SerifText>
        <PujaTray
          language={local.language}
          done={done}
          next={hand ? null : next}
          lit={lit}
          tapKeys={tapKeys}
          drawer={drawer}
          visuals={visuals}
          onItem={onItem}
          onFlower={(kind: FlowerKind) => {
            beadTick();
            // Read the ID now: the updater may run after later taps.
            const id = (flowerId.current += 1);
            setFlowers((values) => [...values, { id, kind }].slice(-FLOWER_LIMIT));
            mark("pushp");
          }}
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
    </ShrinePage>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  deityBar: { alignItems: "center", zIndex: 3, marginTop: 4 },
  picker: {
    minHeight: 50,
    minWidth: 220,
    paddingHorizontal: 22,
    borderRadius: 25,
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
    top: 56,
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
  menuItem: { minHeight: 48, justifyContent: "center", paddingHorizontal: 20 },
  menuItemSelected: { backgroundColor: "rgba(240, 162, 59, 0.18)" },
  stage: { flex: 1, overflow: "hidden" },
  reset: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
});
