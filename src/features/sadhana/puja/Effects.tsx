import React, { useEffect } from "react";
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

// Light, smoke and water for the puja scene (D-054), drawn with Skia on the
// UI thread. Positions come from shared values the scene moves.

export type Emitter = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  // 0 = off, 1 = full.
  on: SharedValue<number>;
};

const SMOKE = 48;
const DROPS = 36;

export function PujaEffects({
  width,
  height,
  lamp,
  incense,
  deity,
  waterKey,
}: {
  width: number;
  height: number;
  lamp: Emitter;
  incense: Emitter[];
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
  }, [waterKey, deity.x, deity.y, width, height, water]);

  useFrameCallback((frame) => {
    "worklet";
    const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
    // Smoke
    const youngPath = Skia.Path.Make();
    const oldPath = Skia.Path.Make();
    smoke.modify((s) => {
      "worklet";
      for (const source of incense) {
        if (source.on.value <= 0) continue;
        s.carry += dt * 26 * source.on.value;
        while (s.carry >= 1) {
          s.carry -= 1;
          const i = s.next;
          s.next = (s.next + 1) % SMOKE;
          s.x[i] = source.x.value + (Math.random() - 0.5) * 3;
          s.y[i] = source.y.value;
          s.age[i] = 0;
        }
      }
      for (let i = 0; i < SMOKE; i += 1) {
        if (s.age[i] > 3.2) continue;
        s.age[i] += dt;
        const a = s.age[i];
        s.y[i] -= dt * (26 + a * 8);
        s.x[i] += Math.sin(a * 2.4 + i) * dt * 14;
        const r = 2.5 + a * 6;
        (a < 1.2 ? youngPath : oldPath).addCircle(s.x[i], s.y[i], r);
      }
      return s;
    });
    young.value = youngPath;
    old.value = oldPath;
    // Water
    const dropPath = Skia.Path.Make();
    water.modify((w) => {
      "worklet";
      for (let i = 0; i < DROPS; i += 1) {
        if (w.age[i] > 1.4) continue;
        w.age[i] += dt;
        w.vy[i] += 420 * dt;
        w.x[i] += w.vx[i] * dt;
        w.y[i] += w.vy[i] * dt;
        dropPath.addOval(Skia.XYWHRect(w.x[i] - 1.6, w.y[i] - 3, 3.2, 6));
      }
      return w;
    });
    drops.value = dropPath;
  });

  // ---- Lamp light: a warm pool around the lamp, and the deity brightening
  // as the flame comes near.
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
