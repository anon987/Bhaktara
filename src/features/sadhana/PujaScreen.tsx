import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Repeat } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import {
  BhogKind,
  FlowerKind,
  GarlandKind,
  offeringsFor,
  TrayItem,
  trayItems,
} from "../../domain/puja";
import { requiredPrayerIds } from "../../domain/progression";
import { sanctum } from "../../theme/tokens";
import { usePlayer } from "../player/PlayerProvider";
import { PetalShower } from "./art/PetalShower";
import { beadTick, malaPulse, useSound } from "./feedback";
import { useProgression } from "./ProgressionProvider";
import { HandItem, PlacedFlower, PujaScene } from "./puja/PujaScene";
import { Drawer, PujaTray } from "./puja/PujaTray";
import { EarningNote, SanctumPage } from "./Sanctum";

// Prarthana as a puja before the chosen deity (D-053), performed from a tray
// of animated offerings with no instructions on screen (D-054). The next
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

  const changeDeity = (id: string) => {
    update((state) => ({ ...state, deityId: id }));
    setChoosing(false);
    // A different deity takes different offerings: begin afresh.
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

  const next = trayItems.find((item) => !done.has(item)) ?? null;
  const lit = new Set<TrayItem>();
  if (hand === "dhoop" || placed.has("dhoop")) lit.add("dhoop");
  if (hand === "deep" || placed.has("deep")) lit.add("deep");

  return (
    <SanctumPage
      title={t("prarthanaShort")}
      subtitle={deity?.name[local.language]}
      onBack={navigation.goBack}
    >
      <View style={styles.body}>
        {deities.length > 1 && (
          <View style={styles.deityBar}>
            {choosing && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {deities.map((item) => {
                  const selected = item.id === deity?.id;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => changeDeity(item.id)}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Txt
                        bold
                        size={17}
                        style={{
                          color: selected ? sanctum.night : sanctum.text,
                        }}
                      >
                        {item.name[local.language]}
                      </Txt>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("pujaChoose")}
              onPress={() => setChoosing((value) => !value)}
              style={styles.change}
            >
              <Repeat size={24} color={sanctum.brassLight} />
            </Pressable>
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
        <PujaTray
          language={local.language}
          done={done}
          next={hand ? null : next}
          lit={lit}
          tapKeys={tapKeys}
          drawer={drawer}
          onItem={onItem}
          onFlower={(kind: FlowerKind) => {
            beadTick();
            flowerId.current += 1;
            setFlowers((values) => [...values, { id: flowerId.current, kind }]);
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
        <EarningNote />
      </View>
      <PetalShower trigger={petals} count={30} />
    </SanctumPage>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  deityBar: {
    position: "absolute",
    top: -62,
    right: 14,
    left: 90,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(243, 213, 138, 0.45)",
    backgroundColor: "rgba(30, 17, 13, 0.92)",
  },
  chipSelected: {
    backgroundColor: sanctum.brass,
    borderColor: sanctum.brassLight,
  },
  change: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(243, 213, 138, 0.5)",
    backgroundColor: "rgba(30, 17, 13, 0.6)",
  },
  stage: { flex: 1, overflow: "hidden" },
});
