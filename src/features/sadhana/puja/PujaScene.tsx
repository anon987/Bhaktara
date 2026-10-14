import React, { useEffect, useRef, useState } from "react";
import {
  GestureResponderEvent,
  Image,
  ImageSourcePropType,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Ellipse, Line, Rect } from "react-native-svg";
import {
  BhogKind,
  DeityOfferings,
  FlowerKind,
  GarlandKind,
} from "../../../domain/puja";
import { noVisuals, Visuals } from "../../../domain/visuals";
import { sanctum } from "../../../theme/tokens";
import { Diya } from "../art/Diya";
import type { Box } from "../decor/geometry";
import { PujaEffects } from "./Effects";
import { Bhog, Flower, Garland, Tilak } from "./OfferingArt";

export type HandItem = "dhoop" | "deep";
// A flower offered at the deity's feet, drawn with its decor image.
export type PlacedFlower = {
  id: number;
  decorId: string;
  image: ImageSourcePropType;
  kind?: FlowerKind;
};

// Where things sit in the scene (D-054): round the murti standing in the
// temple on screen, with the altar line at its feet. `s` scales the drawn
// offerings with the scene as the old 300 × 360 shrine did.
export function sceneLayout(width: number, height: number, murti: Box) {
  const s = Math.max(0.6, Math.min(width / 300, height / 360));
  const size = Math.min(width, (height * 300) / 360);
  const cx = murti.x + murti.width / 2;
  const feet = murti.y + murti.height;
  // Incense to the left of the murti, bhog to the right.
  const side = Math.max(murti.width / 2 + 34 * s, 70 * s);
  return {
    s,
    size,
    murti,
    deity: { x: cx, y: murti.y + murti.height / 2 },
    forehead: { x: cx, y: murti.y + murti.height * 0.2 },
    flowers: { x: cx, y: feet + 6 * s },
    bhog: { x: Math.min(width - 34 * s, cx + side), y: feet + 8 * s },
    dhoop: { x: Math.max(20 * s, cx - side), y: feet + 8 * s },
    lamp: { x: cx, y: feet + 24 * s },
  };
}

// At most this many flowers rest at the deity's feet; a new one replaces the
// oldest, so the altar never fills up.
export const FLOWER_LIMIT = 7;
// One row at the deity's feet, centred on however many flowers there are.
const slot = (i: number, count: number) => ({
  dx: (i - (count - 1) / 2) * 15,
  dy: 0,
});

// The offerings over the temple: tilak and garland on the deity, flowers,
// incense, bhog and the lamp at its feet, the shankh's ripples, and the
// light, smoke and water effects. While the temples are being swiped (or a
// locked temple is shown) the offerings fade out: they belong to the temple
// the devotee worships in.
export function PujaScene({
  width,
  height,
  murti,
  pageWidth,
  page,
  scrollX,
  hidden,
  drawnDeity,
  visuals = noVisuals,
  offerings,
  flowers,
  garland,
  bhog,
  tilak,
  dhoopPlaced,
  deepPlaced,
  incenseBurning,
  hand,
  waterKey,
  shankhKey,
  onHandDone,
  onAartiPulse,
}: {
  width: number;
  height: number;
  // Where the murti stands in the temple on screen.
  murti: Box;
  // The temple pager: its page width, the page the offerings belong to and
  // its scroll position.
  pageWidth: number;
  page: number;
  scrollX: SharedValue<number>;
  hidden: boolean;
  // The deity is the app's drawn art (no murti image): draw the tilak on it.
  drawnDeity: boolean;
  visuals?: Visuals;
  offerings: DeityOfferings;
  flowers: PlacedFlower[];
  garland: GarlandKind | null;
  bhog: BhogKind[];
  tilak: boolean;
  dhoopPlaced: boolean;
  deepPlaced: boolean;
  // The incense on the stand is still burning (it burns out after a while).
  incenseBurning: boolean;
  hand: HandItem | null;
  waterKey: number;
  shankhKey: number;
  onHandDone: (item: HandItem) => void;
  onAartiPulse: () => void;
}) {
  const L = sceneLayout(width, height, murti);
  const resting = dhoopPlaced && hand !== "dhoop";
  const burning = resting && incenseBurning;

  // Shared positions for the lamp and incense (the effects read them).
  const lampX = useSharedValue(L.lamp.x);
  const lampY = useSharedValue(L.lamp.y);
  const lampOn = useSharedValue(deepPlaced ? 0.5 : 0);
  const dhoopX = useSharedValue(L.dhoop.x);
  const dhoopY = useSharedValue(L.dhoop.y);
  const dhoopOn = useSharedValue(0);
  const restX = useSharedValue(L.dhoop.x);
  const restY = useSharedValue(L.dhoop.y - 34 * L.s);
  const restOn = useSharedValue(burning ? 1 : 0);

  useEffect(() => {
    restX.set(L.dhoop.x);
    restY.set(L.dhoop.y - 34 * L.s);
    restOn.set(burning ? 1 : withTiming(0, { duration: 1500 }));
    if (hand !== "deep") {
      lampX.set(L.lamp.x);
      lampY.set(L.lamp.y - 20 * L.s);
      lampOn.set(withTiming(deepPlaced ? 0.45 : 0, { duration: 600 }));
    }
  }, [
    L.dhoop.x,
    L.dhoop.y,
    L.lamp.x,
    L.lamp.y,
    L.s,
    burning,
    deepPlaced,
    hand,
    restX,
    restY,
    restOn,
    lampX,
    lampY,
    lampOn,
  ]);

  // Offerings fade while the temples are swiped (UI thread, no re-render).
  const fade = useAnimatedStyle(() => {
    if (hidden) return { opacity: 0 };
    const away = Math.abs(scrollX.value - page * pageWidth);
    return { opacity: Math.max(0, 1 - away / (pageWidth * 0.3)) };
  });

  return (
    <View style={{ width, height }} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, fade]}
        pointerEvents="none"
      >
        {/* Tilak (on the app's drawn deity; a murti has its own) */}
        {tilak && drawnDeity && (
          <Pop
            style={{
              position: "absolute",
              left: L.forehead.x - 9 * L.s,
              top: L.forehead.y,
            }}
          >
            <Tilak style={offerings.tilak} size={18 * L.s} />
          </Pop>
        )}
        {/* Garland round the deity */}
        {garland && (
          <Drop
            style={{
              position: "absolute",
              left: murti.x - murti.width * 0.05,
              top: murti.y + murti.height * 0.16,
            }}
            distance={40}
          >
            <Garland
              kind={garland}
              width={murti.width * 1.1}
              height={murti.height * 0.5}
              imageKey={visuals.garlands[garland]}
            />
          </Drop>
        )}
        {/* Incense holder */}
        <View
          style={{
            position: "absolute",
            left: L.dhoop.x - 16 * L.s,
            top: L.dhoop.y - 36 * L.s,
          }}
        >
          <Svg width={32 * L.s} height={38 * L.s} viewBox="0 0 32 38">
            <Ellipse cx={16} cy={34} rx={13} ry={4} fill={sanctum.brassDeep} />
            <Rect
              x={11}
              y={26}
              width={10}
              height={9}
              rx={3}
              fill={sanctum.brass}
            />
            {resting &&
              [-4, 0, 4].map((dx) => (
                <Line
                  key={dx}
                  x1={16 + dx * 0.3}
                  y1={28}
                  x2={16 + dx}
                  y2={2}
                  stroke="#5B3A22"
                  strokeWidth={1.6}
                />
              ))}
          </Svg>
        </View>
        {/* Bhog plate */}
        {bhog.length > 0 && (
          <View
            style={{
              position: "absolute",
              left: L.bhog.x - 30 * L.s,
              top: L.bhog.y - 34 * L.s,
              alignItems: "center",
            }}
          >
            <Svg
              width={60 * L.s}
              height={16 * L.s}
              viewBox="0 0 60 16"
              style={{ position: "absolute", top: 24 * L.s }}
            >
              <Ellipse
                cx={30}
                cy={8}
                rx={29}
                ry={7}
                fill={sanctum.brass}
                stroke={sanctum.brassDeep}
                strokeWidth={1}
              />
            </Svg>
            <View style={{ flexDirection: "row" }}>
              {bhog.slice(-3).map((kind) => (
                <Pop key={kind}>
                  <Bhog
                    kind={kind}
                    size={26 * L.s}
                    imageKey={visuals.bhog[kind]}
                  />
                </Pop>
              ))}
            </View>
            {offerings.tulsiOnBhog && (
              <View
                style={{ position: "absolute", top: -6 * L.s, right: 2 * L.s }}
              >
                <Flower
                  kind="tulsi"
                  size={16 * L.s}
                  imageKey={visuals.flowers.tulsi}
                />
              </View>
            )}
          </View>
        )}
        {/* Flowers at the deity's feet, drawn with their decor images */}
        {flowers.slice(-FLOWER_LIMIT).map((flower, i, shown) => {
          const p = slot(i, shown.length);
          const size = 26 * L.s;
          return (
            <Drop
              key={flower.id}
              distance={L.size * 0.5}
              spin
              style={{
                position: "absolute",
                left: L.flowers.x + p.dx * L.s - size / 2,
                top: L.flowers.y + p.dy * L.s - size * 0.8,
              }}
            >
              <Image
                accessible={false}
                source={flower.image}
                resizeMode="contain"
                fadeDuration={0}
                style={{ width: size, height: size }}
              />
            </Drop>
          );
        })}
        {/* The lamp, resting on the altar after the aarti */}
        {deepPlaced && hand !== "deep" && (
          <View
            style={{
              position: "absolute",
              left: L.lamp.x - 22 * L.s,
              top: L.lamp.y - 40 * L.s,
            }}
          >
            <Diya size={44 * L.s} glow={0.6} />
          </View>
        )}
      </Animated.View>
      <Ripple trigger={shankhKey} x={L.deity.x} y={L.deity.y} size={L.size} />
      <PujaEffects
        width={width}
        height={height}
        lamp={{ x: lampX, y: lampY, on: lampOn }}
        incense={[
          { x: dhoopX, y: dhoopY, on: dhoopOn },
          { x: restX, y: restY, on: restOn },
        ]}
        smoking={hand === "dhoop" || burning}
        deity={L.deity}
        waterKey={waterKey}
      />
      {hand && (
        <Hand
          key={hand}
          item={hand}
          layout={L}
          width={width}
          height={height}
          x={hand === "deep" ? lampX : dhoopX}
          y={hand === "deep" ? lampY : dhoopY}
          on={hand === "deep" ? lampOn : dhoopOn}
          onDone={onHandDone}
          onPulse={onAartiPulse}
        />
      )}
    </View>
  );
}

const TAU = Math.PI * 2;
// How much waving completes each: the aarti about three circles round the
// deity (or ~15 s of movement), the dhoop about one and a half (~6 s).
const goal: Record<HandItem, { turns: number; seconds: number }> = {
  deep: { turns: 3, seconds: 15 },
  dhoop: { turns: 1.5, seconds: 6 },
};
const IDLE_MS = 4000;

// The lamp or incense in the user's hand: it follows the finger anywhere.
// If nobody moves it for a few seconds it circles the deity by itself, so
// the puja never stalls (D-054).
function Hand({
  item,
  layout: L,
  width,
  height,
  x,
  y,
  on,
  onDone,
  onPulse,
}: {
  item: HandItem;
  layout: ReturnType<typeof sceneLayout>;
  width: number;
  height: number;
  x: SharedValue<number>;
  y: SharedValue<number>;
  on: SharedValue<number>;
  onDone: (item: HandItem) => void;
  onPulse: () => void;
}) {
  const [done, setDone] = useState(false);
  // The item's own position (the flame or the incense tips are above it).
  const lift = item === "deep" ? 26 * L.s : 40 * L.s;
  const px = useSharedValue(L.deity.x);
  const py = useSharedValue(L.deity.y + L.size * 0.42);
  // Gesture handling lives in the mount effect; handlers reach it here.
  const api = useRef<{
    touch: (nx: number, ny: number, start: boolean) => void;
    release: () => void;
  } | null>(null);

  useEffect(() => {
    const p = {
      angle: 0,
      last: null as number | null,
      moving: 0,
      lastTouch: Date.now(),
      pulse: 0,
      done: false,
    };
    const place = (nx: number, ny: number) => {
      px.set(nx);
      py.set(ny);
      x.set(nx);
      y.set(ny - lift);
    };
    const advance = (nx: number, ny: number, dtSeconds: number) => {
      // Once complete, the item is settling back on the altar.
      if (p.done) return;
      const angle = Math.atan2(ny - L.deity.y, nx - L.deity.x);
      if (p.last !== null) {
        let delta = angle - p.last;
        if (delta > Math.PI) delta -= TAU;
        if (delta < -Math.PI) delta += TAU;
        p.angle += Math.abs(delta);
      }
      p.last = angle;
      p.moving += dtSeconds;
      p.pulse += dtSeconds;
      if (item === "deep" && p.pulse > 1.4) {
        p.pulse = 0;
        onPulse();
      }
      place(nx, ny);
      const g = goal[item];
      if (p.angle >= g.turns * TAU || p.moving >= g.seconds) {
        p.done = true;
        setDone(true);
      }
    };
    api.current = {
      touch: (nx, ny, start) => {
        const now = Date.now();
        const dt = start ? 0 : Math.min(0.1, (now - p.lastTouch) / 1000);
        p.lastTouch = now;
        if (start) p.last = null;
        advance(nx, ny, dt);
      },
      release: () => {
        p.lastTouch = Date.now();
      },
    };
    on.set(withTiming(1, { duration: 400 }));
    place(px.get(), py.get());
    // Idle: circle round the deity by itself.
    const radius = L.size * 0.36;
    let theta = Math.PI / 2;
    const handle = setInterval(() => {
      // Done: the item settles by itself; stop ticking.
      if (p.done) return clearInterval(handle);
      if (Date.now() - p.lastTouch < IDLE_MS) return;
      theta += TAU / 75;
      advance(
        L.deity.x + Math.cos(theta) * radius,
        L.deity.y + Math.sin(theta) * radius * 1.15,
        0.033,
      );
    }, 33);
    return () => {
      clearInterval(handle);
      api.current = null;
      // The moving incense stops smoking; the holder on the altar takes over.
      if (item === "dhoop") on.set(0);
    };
    // Runs once per item in hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When done, the item settles back on the altar after a moment.
  useEffect(() => {
    if (!done) return;
    const handle = setTimeout(() => {
      const home = item === "deep" ? L.lamp : L.dhoop;
      const settle = { duration: 700, easing: Easing.out(Easing.quad) };
      px.set(withTiming(home.x, settle));
      py.set(withTiming(home.y - 10 * L.s, settle));
      x.set(withTiming(home.x, settle));
      y.set(withTiming(home.y - 10 * L.s - lift, settle));
      setTimeout(() => onDone(item), 720);
    }, 1200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // The item rides just above the finger so the finger never hides it.
  const touch = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (event: GestureResponderEvent) =>
      api.current?.touch(
        event.nativeEvent.locationX,
        event.nativeEvent.locationY - 40,
        true,
      ),
    onResponderMove: (event: GestureResponderEvent) =>
      api.current?.touch(
        event.nativeEvent.locationX,
        event.nativeEvent.locationY - 40,
        false,
      ),
    onResponderRelease: () => api.current?.release(),
  };

  const itemStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: px.value - 30 * L.s },
      { translateY: py.value - 60 * L.s },
    ],
  }));

  return (
    <View
      style={[StyleSheet.absoluteFill, { width, height }]}
      {...touch}
      testID="puja-hand"
      accessible={false}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: 60 * L.s,
            height: 70 * L.s,
            alignItems: "center",
            justifyContent: "flex-end",
          },
          itemStyle,
        ]}
      >
        {item === "deep" ? (
          <View style={{ alignItems: "center" }}>
            <Diya size={52 * L.s} glow={1} />
            <Svg width={30 * L.s} height={10 * L.s} viewBox="0 0 30 10">
              <Rect
                x={4}
                y={0}
                width={22}
                height={4}
                rx={2}
                fill={sanctum.brass}
              />
              <Rect
                x={13}
                y={4}
                width={4}
                height={6}
                fill={sanctum.brassDeep}
              />
            </Svg>
          </View>
        ) : (
          <Svg width={40 * L.s} height={60 * L.s} viewBox="0 0 40 60">
            {[-6, 0, 6].map((dx) => (
              <Line
                key={dx}
                x1={20 + dx * 0.2}
                y1={58}
                x2={20 + dx}
                y2={8}
                stroke="#5B3A22"
                strokeWidth={2.2}
              />
            ))}
            {[-6, 0, 6].map((dx) => (
              <Ellipse
                key={`t${dx}`}
                cx={20 + dx}
                cy={7}
                rx={2.2}
                ry={3}
                fill={sanctum.flame}
              />
            ))}
          </Svg>
        )}
      </Animated.View>
    </View>
  );
}

// Scale-in for a new offering.
function Pop({ children, style }: React.PropsWithChildren<{ style?: object }>) {
  const scale = useSharedValue(0.2);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.15, { duration: 260 }),
      withTiming(1, { duration: 160 }),
    );
  }, [scale]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: Math.min(1, scale.value * 1.4),
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

// An offering falling into place (flowers drift down to the deity's feet).
function Drop({
  children,
  style,
  distance,
  spin = false,
}: React.PropsWithChildren<{
  style?: object;
  distance: number;
  spin?: boolean;
}>) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
  }, [t]);
  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 2),
    transform: [
      { translateY: (1 - t.value) * -distance },
      { translateX: Math.sin(t.value * Math.PI * 2) * (spin ? 8 : 0) },
      { rotate: `${(1 - t.value) * (spin ? 160 : 0)}deg` },
    ],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

// The shankh's sound made visible: golden rings spreading from the deity.
function Ripple({
  trigger,
  x,
  y,
  size,
}: {
  trigger: number;
  x: number;
  y: number;
  size: number;
}) {
  const t = useSharedValue(1);
  useEffect(() => {
    if (trigger === 0) return;
    t.value = 0;
    t.value = withTiming(1, {
      duration: 1800,
      easing: Easing.out(Easing.quad),
    });
  }, [trigger, t]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <RippleRing t={t} delay={0} x={x} y={y} size={size} />
      <RippleRing t={t} delay={0.25} x={x} y={y} size={size} />
    </View>
  );
}

function RippleRing({
  t,
  delay,
  x,
  y,
  size,
}: {
  t: SharedValue<number>;
  delay: number;
  x: number;
  y: number;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (t.value - delay) / (1 - delay)));
    const d = size * (0.3 + p * 1.1);
    return {
      opacity: p > 0 && p < 1 ? (1 - p) * 0.8 : 0,
      width: d,
      height: d,
      borderRadius: d / 2,
      transform: [{ translateX: x - d / 2 }, { translateY: y - d / 2 }],
    };
  });
  return <Animated.View style={[styles.ring, style]} />;
}

const styles = StyleSheet.create({
  ring: {
    position: "absolute",
    borderWidth: 3,
    borderColor: sanctum.brassLight,
  },
});
