import React from "react";
import { StyleSheet, View } from "react-native";
import { DevotionalArt } from "../../components/DevotionalArt";
import { Deity } from "../../domain/models";
import { colors, sanctum } from "../../theme/tokens";

const RING = 3;
const GAP = 3;

// The deity's picture in a round brass frame, like a temple medallion. The
// art comes from the deity's `artKey` through the media path; without a CDN
// copy (or if it fails to load) DevotionalArt draws the app's own deity art.
export function DeityCircle({ deity, size }: { deity: Deity; size: number }) {
  const inner = size - 2 * (RING + GAP);
  return (
    <View
      testID={`deity-image-${deity.id}`}
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          overflow: "hidden",
        }}
      >
        <DevotionalArt assetKey={deity.artKey} size={inner} square />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: RING,
    borderColor: sanctum.brass,
    padding: GAP,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: sanctum.brassDeep,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
