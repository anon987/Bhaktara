import React, { useEffect, useRef, useState } from "react";
import { GestureResponderEvent, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Defs,
  Ellipse,
  Line,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { useReducedMotion } from "../../../components/useReducedMotion";
import {
  BhogKind,
  DeityOfferings,
  FlowerKind,
  GarlandKind,
} from "../../../domain/puja";
import { noVisuals, Visuals } from "../../../domain/visuals";
import { sanctum } from "../../../theme/tokens";
import { Diya } from "../art/Diya";
import { SANCTUM, SHRINE_VIEW, Shrine, deityCentre } from "../art/Shrine";
import { PujaEffects } from "./Effects";
import { Bhog, Flower, Garland, Tilak } from "./OfferingArt";
import { useTilt } from "./useTilt";

export type HandItem = "dhoop" | "deep";
export type PlacedFlower = { id: number; kind: FlowerKind };

// Where things sit in the scene, from the stage size (D-054).
export function sceneLayout(width: number, height: number) {
  const size = Math.min(
    width - 24,
    (height / SHRINE_VIEW.height) * SHRINE_VIEW.width,
  );
  const s = size / SHRINE_VIEW.width;
  const left = (width - size) / 2;
  const top = (height - SHRINE_VIEW.height * s) / 2;
  const at = (x: number, y: number) => ({ x: left + x * s, y: top + y * s });
  return {
    size,
    s,
    left,
    top,
    deity: at(deityCentre.x, deityCentre.y),
    forehead: at(deityCentre.x, SANCTUM.y + SANCTUM.height * 0.22),
    altar: top + 300 * s,
    flowers: at(deityCentre.x, 300),
    bhog: at(206, 300),
    dhoop: at(94, 300),
    lamp: at(deityCentre.x, 312),
  };
}

const FLOWER_SLOTS = 14;
// Flower pile positions around the deity's feet, front row first.
const slot = (i: number) => {
  const row = i < 8 ? 0 : 1;
  const k = row === 0 ? i : i - 8;
  const n = row === 0 ? 8 : 6;
  return {
    dx: (k - (n - 1) / 2) * (row === 0 ? 15 : 13),
    dy: row === 0 ? 0 : -10,
  };
};

export function PujaScene({
  width,
  height,
  artKey,
  shrineKey,
  visuals = noVisuals,
  offerings,
  flowers,
  garland,
  bhog,
  tilak,
  dhoopPlaced,
  deepPlaced,
  hand,
  waterKey,
  shankhKey,
  glow,
  onHandDone,
  onAartiPulse,
}: {
  width: number;
  height: number;
  artKey: string;
  shrineKey?: string;
  visuals?: Visuals;
  offerings: DeityOfferings;
  flowers: PlacedFlower[];
  garland: GarlandKind | null;
  bhog: BhogKind[];
  tilak: boolean;
  dhoopPlaced: boolean;
  deepPlaced: boolean;
  hand: HandItem | null;
  waterKey: number;
  shankhKey: number;
  glow: boolean;
  onHandDone: (item: HandItem) => void;
  onAartiPulse: () => void;
}) {
  const reduced = useReducedMotion();
  const tilt = useTilt(!reduced);
  const L = sceneLayout(width, height);

  // Shared positions for the lamp and incense (the effects read them).
  const lampX = useSharedValue(L.lamp.x);
  const lampY = useSharedValue(L.lamp.y);
  const lampOn = useSharedValue(deepPlaced ? 0.5 : 0);
  const dhoopX = useSharedValue(L.dhoop.x);
  const dhoopY = useSharedValue(L.dhoop.y);
  const dhoopOn = useSharedValue(dhoopPlaced ? 1 : 0);
  const restX = useSharedValue(L.dhoop.x);
  const restY = useSharedValue(L.dhoop.y - 34 * L.s);
  const restOn = useSharedValue(dhoopPlaced ? 1 : 0);

  useEffect(() => {
    restX.set(L.dhoop.x);
    restY.set(L.dhoop.y - 34 * L.s);
    restOn.set(dhoopPlaced && hand !== "dhoop" ? 1 : 0);
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
    dhoopPlaced,
    deepPlaced,
    hand,
    restX,
    restY,
    restOn,
    lampX,
    lampY,
    lampOn,
  ]);

  // 2.5D: the temple turns slightly with the phone; the glow behind and the
  // offerings in front move by different amounts.
  const templeStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { translateX: tilt.x.value * 4 },
      { rotateY: `${tilt.x.value * 6}deg` },
      { rotateX: `${-tilt.y.value * 4}deg` },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -tilt.x.value * 12 },
      { translateY: -tilt.y.value * 8 },
    ],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tilt.x.value * 9 },
      { translateY: tilt.y.value * 5 },
    ],
  }));

  return (
    <View style={{ width, height }}>
      {/* Back glow */}
      <Animated.View
        style={[StyleSheet.absoluteFill, backStyle]}
        pointerEvents="none"
      >
        <Svg width={width} height={height}>
          <Defs>
            <RadialGradient id="puja-back" cx="50%" cy="50%" r="50%">
              <Stop
                offset="0"
                stopColor={sanctum.flame}
                stopOpacity={glow ? 0.28 : 0.14}
              />
              <Stop offset="1" stopColor={sanctum.flame} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={L.deity.x}
            cy={L.deity.y}
            rx={L.size * 0.62}
            ry={L.size * 0.7}
            fill="url(#puja-back)"
          />
        </Svg>
      </Animated.View>
      {/* Temple, deity, tilak and garland */}
      <Animated.View
        style={[
          { position: "absolute", left: L.left, top: L.top },
          templeStyle,
        ]}
      >
        <Shrine size={L.size} artKey={artKey} imageKey={shrineKey} glow={glow}>
          {/* A painted temple's deity has its own tilak. */}
          {tilak && !shrineKey && (
            <Pop
              style={{
                position: "absolute",
                left: (deityCentre.x - 9) * L.s,
                top: (SANCTUM.y + SANCTUM.height * 0.16) * L.s,
              }}
            >
              <Tilak style={offerings.tilak} size={18 * L.s} />
            </Pop>
          )}
          {garland && (
            <Drop
              style={{
                position: "absolute",
                left: (SANCTUM.x - 10) * L.s,
                top: (SANCTUM.y + 6) * L.s,
              }}
              distance={40}
            >
              <Garland
                kind={garland}
                width={(SANCTUM.width + 20) * L.s}
                height={SANCTUM.height * 0.62 * L.s}
                imageKey={visuals.garlands[garland]}
              />
            </Drop>
          )}
        </Shrine>
      </Animated.View>
      {/* Offerings on the altar, in front */}
      <Animated.View
        style={[StyleSheet.absoluteFill, frontStyle]}
        pointerEvents="none"
      >
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
            {dhoopPlaced &&
              hand !== "dhoop" &&
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
        {/* Flowers at the deity's feet */}
        {flowers.slice(-FLOWER_SLOTS).map((flower, i) => {
          const p = slot(i);
          return (
            <Drop
              key={flower.id}
              distance={L.size * 0.5}
              spin
              style={{
                position: "absolute",
                left: L.flowers.x + p.dx * L.s - 11 * L.s,
                top: L.flowers.y + p.dy * L.s - 18 * L.s,
              }}
            >
              <Flower
                kind={flower.kind}
                size={22 * L.s}
                imageKey={visuals.flowers[flower.kind]}
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
