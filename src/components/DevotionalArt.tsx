import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { resolveMediaUrl } from "../services/media/config";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
// Asset-key resolver seam: CDN keys load from R2 via the configured media base;
// placeholder keys, unconfigured builds and failed loads use symbolic local art.
const palettes: Record<string, [string, string, string]> = {
  shiva: ["#203E43", "#678C88", "#DCBF81"],
  krishna: ["#324D42", "#97AA75", "#F0D293"],
  ganesha: ["#A7522E", "#EAA35C", "#FFE0A4"],
  hanuman: ["#7C352B", "#D5814F", "#F6D7A0"],
  durga: ["#632D3D", "#B56870", "#EDCB83"],
};
// size is the frame height; "100%" fills a parent that sets its own aspect.
type ArtProps = { assetKey: string; size?: number | "100%"; lit?: boolean };
export function DevotionalArt({ assetKey, size = 160, lit = false }: ArtProps) {
  const uri = resolveMediaUrl(assetKey);
  const [failed, setFailed] = useState<string | null>(null);
  if (uri && failed !== uri)
    return (
      <View accessible={false} style={[styles.frame, { height: size }]}>
        <Image
          source={{ uri }}
          resizeMode="cover"
          onError={() => setFailed(uri)}
          style={StyleSheet.absoluteFill}
        />
        {lit && <View pointerEvents="none" style={styles.glow} />}
      </View>
    );
  return <SymbolicArt assetKey={assetKey} size={size} lit={lit} />;
}
function SymbolicArt({ assetKey, size = 160, lit = false }: ArtProps) {
  const id = React.useId().replace(/:/g, "");
  const deity = assetKey.split("/").pop() ?? "";
  const [dark, light, gold] = palettes[deity] ?? palettes.ganesha;
  return (
    <View accessible={false} style={[styles.frame, { height: size }]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 300 300"
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={light} />
            <Stop offset="1" stopColor={dark} />
          </LinearGradient>
        </Defs>
        <Rect width="300" height="300" fill={`url(#${id})`} />
        <Circle
          cx="150"
          cy="137"
          r="103"
          fill="none"
          stroke={gold}
          opacity="0.2"
        />
        <Circle
          cx="150"
          cy="137"
          r="85"
          fill="none"
          stroke={gold}
          opacity="0.35"
        />
        <Path
          d="M59 300V142C59 86 100 46 150 29C200 46 241 86 241 142V300"
          fill={dark}
          opacity="0.3"
          stroke={gold}
          strokeWidth="2"
        />
        <Path
          d="M76 300V149C76 107 108 71 150 51C192 71 224 107 224 149V300"
          fill="none"
          stroke={gold}
          opacity="0.5"
        />
        <Circle cx="150" cy="132" r="54" fill={gold} opacity="0.13" />
        <G stroke={gold} strokeWidth="2" fill="none">
          <Path d="M150 196C117 178 114 149 150 122C186 149 183 178 150 196Z" />
          <Path d="M150 196C115 195 88 171 95 143C127 145 147 166 150 196Z" />
          <Path d="M150 196C185 195 212 171 205 143C173 145 153 166 150 196Z" />
          <Path d="M150 199C110 210 87 194 77 171C112 163 138 179 150 199Z" />
          <Path d="M150 199C190 210 213 194 223 171C188 163 162 179 150 199Z" />
        </G>
        <Path d="M112 230Q150 267 188 230Z" fill={gold} />
        <Path
          d="M150 230C126 214 150 200 150 182C155 205 173 218 150 230Z"
          fill={lit ? "#FFF7B9" : gold}
          opacity={lit ? 1 : 0.8}
        />
        {lit && (
          <Circle cx="150" cy="211" r="28" fill="#FFF0A1" opacity="0.2" />
        )}
        <Ellipse cx="150" cy="266" rx="77" ry="5" fill={gold} opacity="0.22" />
        <G fill={gold} opacity="0.65">
          <Circle cx="40" cy="62" r="2" />
          <Circle cx="261" cy="104" r="2" />
          <Circle cx="47" cy="214" r="2" />
          <Circle cx="257" cy="240" r="2" />
        </G>
      </Svg>
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { borderRadius: 18, overflow: "hidden", width: "100%" },
  // Warm wash standing in for the lit-diya state on photographic art.
  glow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#FFD98A2E",
  },
});
