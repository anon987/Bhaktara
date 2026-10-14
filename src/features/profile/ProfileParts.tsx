import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { badgeArt } from "../../components/badgeArt";
import { resolveMediaUrl } from "../../services/media/config";
import { colors } from "../../theme/tokens";

const defaultAvatar = require("../../../assets/tabs/profile.webp");

// The devotee's photo (or the 3D devotee) in a haldi-gold ring. `preview` is
// a local file shown while a new photo uploads.
export function Avatar({
  photoKey,
  size,
  preview,
  label,
}: {
  photoKey: string | null;
  size: number;
  preview?: string | null;
  label?: string;
}) {
  const url = preview ?? (photoKey ? resolveMediaUrl(photoKey) : null);
  // A photo that fails to load falls back to the default devotee.
  const [failed, setFailed] = useState<string | null>(null);
  const own = Boolean(url && failed !== url);
  const ring = Math.max(4, Math.round(size * 0.045));
  return (
    <LinearGradient
      colors={[colors.haldi, colors.gold, colors.saffron]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      accessible={Boolean(label)}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label}
      style={{
        width: size + ring * 2 + 6,
        height: size + ring * 2 + 6,
        borderRadius: (size + ring * 2 + 6) / 2,
        padding: ring,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: size + 6,
          height: size + 6,
          borderRadius: (size + 6) / 2,
          backgroundColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image
          testID={own ? "avatar-photo" : "avatar-default"}
          source={own && url ? { uri: url } : defaultAvatar}
          onError={() => url && setFailed(url)}
          resizeMode="cover"
          style={{
            // Explicit size: bundled art otherwise draws at its pixel size.
            width: own ? size : size * 0.86,
            height: own ? size : size * 0.86,
            borderRadius: size / 2,
          }}
        />
      </View>
    </LinearGradient>
  );
}

// A badge's 3D medallion: bright when earned, quiet and grey until then.
export function Medallion({
  iconKey,
  earned,
  size,
}: {
  iconKey: string;
  earned: boolean;
  size: number;
}) {
  return (
    <View
      style={[
        styles.medallion,
        { width: size, height: size, borderRadius: size / 2 },
        earned ? styles.glow : styles.locked,
      ]}
    >
      <Image
        source={badgeArt(iconKey)}
        resizeMode="contain"
        accessible={false}
        style={{ width: size, height: size }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  medallion: { alignItems: "center", justifyContent: "center" },
  // Grey and faint until earned (filter: Android, New Architecture).
  locked: { opacity: 0.4, filter: [{ grayscale: 1 }] },
  glow: {
    backgroundColor: "rgba(244, 196, 48, 0.22)",
    shadowColor: colors.haldi,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
});
