import React from "react";
import { StyleSheet, View } from "react-native";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { GuideSwitch } from "../../components/GuideSwitch";
import { useSettingsGuideActive } from "../../services/platform/settingsGuide";
import { colors } from "../../theme/tokens";

// What Bhaktara shows inside its small picture-in-picture window while the
// user is on Android's "Modify system settings" screen: just the switch to
// turn on, in large type. Covers the whole app, which is not usable there.
export function SettingsGuideOverlay() {
  const active = useSettingsGuideActive();
  const { t } = useApp();
  if (!active) return null;
  return (
    <View
      style={styles.overlay}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${t("guideTurnOn")}. ${t("guideAutoReturn")}`}
    >
      <GuideSwitch width={88} />
      <Txt
        bold
        size={20}
        numberOfLines={2}
        adjustsFontSizeToFit
        style={styles.center}
      >
        {t("guideTurnOn")}
      </Txt>
      <Txt
        muted
        size={13}
        numberOfLines={2}
        adjustsFontSizeToFit
        style={styles.center}
      >
        {t("guideAutoReturn")}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    gap: 10,
  },
  center: { textAlign: "center" },
});
