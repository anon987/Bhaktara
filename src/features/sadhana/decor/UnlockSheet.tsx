import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Play } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Txt } from "../../../components/ui";
import { colors, shrine } from "../../../theme/tokens";
import { SerifText } from "../shrine/Ornaments";
import { MandirDecor } from "./decor";

// A large, plain sheet for a locked temple, light, bell or flower: its
// picture and name, one big button to watch a short ad, and "Not now".
export function UnlockSheet({
  item,
  language,
  busy,
  labels,
  onWatch,
  onClose,
}: {
  item: MandirDecor | null;
  language: "en" | "hi";
  busy: boolean;
  labels: { watch: string; notNow: string; opening: string };
  onWatch: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={item !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={busy ? () => undefined : onClose}
    >
      <Pressable
        accessible={false}
        style={styles.scrim}
        onPress={busy ? undefined : onClose}
      />
      {item && (
        <View
          testID="unlock-sheet"
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}
        >
          <Image
            accessible={false}
            source={item.image}
            resizeMode="contain"
            fadeDuration={0}
            style={
              item.kind === "temple"
                ? { width: 150, height: 210, borderRadius: 16 }
                : { width: 170, height: 150 }
            }
          />
          <SerifText size={26} accessibilityRole="header">
            {item.name[language]}
          </SerifText>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={onWatch}
            style={({ pressed }) => [
              styles.watch,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Play size={24} color={colors.white} fill={colors.white} />
            )}
            <Txt bold size={20} style={{ color: colors.white }}>
              {busy ? labels.opening : labels.watch}
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onClose}
            style={({ pressed }) => [styles.later, pressed && { opacity: 0.7 }]}
          >
            <Txt bold size={19} style={{ color: shrine.maroon }}>
              {labels.notNow}
            </Txt>
          </Pressable>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(42, 10, 8, 0.55)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    gap: 14,
    paddingTop: 24,
    paddingHorizontal: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: shrine.ivory,
    borderTopWidth: 3,
    borderColor: colors.haldi,
  },
  watch: {
    alignSelf: "stretch",
    minHeight: 64,
    borderRadius: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.primary,
  },
  later: {
    alignSelf: "stretch",
    minHeight: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: shrine.line,
  },
});
