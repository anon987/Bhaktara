import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Path,
  RadialGradient,
  Skia,
  SkPath,
  vec,
} from "@shopify/react-native-skia";
import {
  SharedValue,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

// Light, smoke and water for the puja scene (D-054), drawn with Skia on the
// UI thread. Positions come from shared values the scene moves.
//
// Performance: the particle simulation runs in a frame callback only while
// incense is lit or smoke or drops are still in the air. When the last
// particle fades it draws empty paths once and asks to be switched off, so
// an idle scene neither runs per-frame work nor redraws this full-screen
// canvas (its blurred smoke paths were the main idle cost).

export type Emitter = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  // 0 = off, 1 = full.
  on: SharedValue<number>;
};

const SMOKE = 48;
const DROPS = 36;
const SMOKE_LIFE = 3.2;
const DROP_LIFE = 1.4;
// Idle frames before the callback asks to stop (lets a just-started burst
// reach the UI thread first).
const IDLE_FRAMES = 20;

export function PujaEffects({
  width,
  height,
  lamp,
  incense,
  smoking,
  deity,
  waterKey,
}: {
  width: number;
  height: number;
  lamp: Emitter;
  incense: Emitter[];
  // Incense is lit (in the hand or burning on the stand).
  smoking: boolean;
  deity: { x: number; y: number };
  waterKey: number;
}) {
  // ---- Smoke: particles born at each lit incense tip, rising and widening.
  const smoke = useSharedValue({
    x: new Array<number>(SMOKE).fill(0),
    y: new Array<number>(SMOKE).fill(0),
    age: new Array<number>(SMOKE).fill(99),
    next: 0,
    carry: 0,
  });
  const young = useSharedValue<SkPath>(Skia.Path.Make());
  const old = useSharedValue<SkPath>(Skia.Path.Make());

  // ---- Water: a burst of drops over the deity when the kalash is used.
  const water = useSharedValue({
    x: new Array<number>(DROPS).fill(0),
    y: new Array<number>(DROPS).fill(0),
    vx: new Array<number>(DROPS).fill(0),
    vy: new Array<number>(DROPS).fill(0),
    age: new Array<number>(DROPS).fill(99),
  });
  const drops = useSharedValue<SkPath>(Skia.Path.Make());
  // UI-thread bookkeeping: whether the last frame drew anything, and how
  // many frames in a row had nothing to draw.
  const idle = useSharedValue({ drawn: false, frames: 0 });

  // Switched on from JS (incense lit, a water burst); switched off when the
  // UI thread reports nothing left to draw and no incense is burning.
  const smokingRef = useRef(smoking);
  const stop = useRef<(() => void) | null>(null);
  const onIdle = useCallback(() => {
    if (!smokingRef.current) stop.current?.();
  }, []);

  const frame = useFrameCallback((info) => {
    "worklet";
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    let lit = false;
    for (const source of incense) if (source.on.value > 0) lit = true;
    const s = smoke.value;
    const w = water.value;
    let alive = lit;
    if (!alive)
      for (let i = 0; i < SMOKE; i += 1)
        if (s.age[i] <= SMOKE_LIFE) {
          alive = true;
          break;
        }
    if (!alive)
      for (let i = 0; i < DROPS; i += 1)
        if (w.age[i] <= DROP_LIFE) {
          alive = true;
          break;
        }
    const state = idle.value;
    if (!alive) {
      // Clear what the last frame drew, once; then do nothing per frame.
      if (state.drawn) {
        young.value = Skia.Path.Make();
        old.value = Skia.Path.Make();
        drops.value = Skia.Path.Make();
      }
      const frames = state.frames + 1;
      idle.value = { drawn: false, frames };
      if (frames === IDLE_FRAMES) scheduleOnRN(onIdle);
      return;
    }
    idle.value = { drawn: true, frames: 0 };
    // Smoke
    const youngPath = Skia.Path.Make();
    const oldPath = Skia.Path.Make();
    smoke.modify((p) => {
      "worklet";
      for (const source of incense) {
        if (source.on.value <= 0) continue;
        p.carry += dt * 26 * source.on.value;
        while (p.carry >= 1) {
          p.carry -= 1;
          const i = p.next;
          p.next = (p.next + 1) % SMOKE;
          p.x[i] = source.x.value + (Math.random() - 0.5) * 3;
          p.y[i] = source.y.value;
          p.age[i] = 0;
        }
      }
      for (let i = 0; i < SMOKE; i += 1) {
        if (p.age[i] > SMOKE_LIFE) continue;
        p.age[i] += dt;
        const a = p.age[i];
        p.y[i] -= dt * (26 + a * 8);
        p.x[i] += Math.sin(a * 2.4 + i) * dt * 14;
        const r = 2.5 + a * 6;
        (a < 1.2 ? youngPath : oldPath).addCircle(p.x[i], p.y[i], r);
      }
      return p;
    });
    young.value = youngPath;
    old.value = oldPath;
    // Water
    const dropPath = Skia.Path.Make();
    water.modify((d) => {
      "worklet";
      for (let i = 0; i < DROPS; i += 1) {
        if (d.age[i] > DROP_LIFE) continue;
        d.age[i] += dt;
        d.vy[i] += 420 * dt;
        d.x[i] += d.vx[i] * dt;
        d.y[i] += d.vy[i] * dt;
        dropPath.addOval(Skia.XYWHRect(d.x[i] - 1.6, d.y[i] - 3, 3.2, 6));
      }
      return d;
    });
    drops.value = dropPath;
  }, false);

  const setActive = frame.setActive;
  useEffect(() => {
    stop.current = () => setActive(false);
  }, [setActive]);
  useEffect(() => {
    smokingRef.current = smoking;
    if (smoking) setActive(true);
  }, [smoking, setActive]);

  useEffect(() => {
    if (waterKey === 0) return;
    const cx = deity.x;
    const top = deity.y - height * 0.22;
    water.modify((w) => {
      "worklet";
      for (let i = 0; i < DROPS; i += 1) {
        w.x[i] = cx + (Math.random() - 0.5) * width * 0.3;
        w.y[i] = top + (Math.random() - 0.5) * 20;
        w.vx[i] = (Math.random() - 0.5) * 60;
        w.vy[i] = -40 - Math.random() * 120;
        w.age[i] = Math.random() * 0.15;
      }
      return w;
    });
    setActive(true);
    // Only a new burst restarts it; the scene's size settling does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waterKey]);

  // ---- Lamp light: a warm pool around the lamp, and the deity brightening
  // as the flame comes near. Derived values: the canvas redraws only when
  // the lamp moves or fades.
  const centre = useDerivedValue(() => vec(lamp.x.value, lamp.y.value));
  const lampOpacity = useDerivedValue(() => lamp.on.value);
  const nearness = useDerivedValue(() => {
    const dx = lamp.x.value - deity.x;
    const dy = lamp.y.value - deity.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    return lamp.on.value * Math.max(0, 1 - d / (width * 0.7)) * 0.8;
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={{ width, height }}>
        <Group opacity={nearness} blendMode="screen">
          <Circle cx={deity.x} cy={deity.y} r={width * 0.32}>
            <RadialGradient
              c={vec(deity.x, deity.y)}
              r={width * 0.32}
              colors={["rgba(255,214,140,0.55)", "rgba(255,214,140,0)"]}
            />
          </Circle>
        </Group>
        <Group opacity={lampOpacity} blendMode="screen">
          <Circle c={centre} r={width * 0.26}>
            <RadialGradient
              c={centre}
              r={width * 0.26}
              colors={[
                "rgba(255,226,160,0.6)",
                "rgba(255,170,70,0.18)",
                "rgba(255,170,70,0)",
              ]}
            />
          </Circle>
        </Group>
        <Path path={young} color="rgba(237,227,214,0.42)">
          <BlurMask blur={4} style="normal" />
        </Path>
        <Path path={old} color="rgba(237,227,214,0.18)">
          <BlurMask blur={8} style="normal" />
        </Path>
        <Path path={drops} color="rgba(190,225,255,0.85)" />
      </Canvas>
    </View>
  );
}
