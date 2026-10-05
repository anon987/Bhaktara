import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../../app/providers/AppProvider";
import { Button, Txt } from "../../components/ui";
import { GuideSwitch } from "../../components/GuideSwitch";
import { colors } from "../../theme/tokens";
import { StringKey } from "../../i18n/strings";

// Explains, before leaving Bhaktara, the one switch Android requires for
// setting a ringtone ("Modify system settings" cannot be granted in-app).
// Large type and numbered steps for elderly users.
export function SystemPermissionSheet({
  visible,
  guided,
  onContinue,
  onCancel,
}: {
  visible: boolean;
  // A picture-in-picture guide will stay on screen and Bhaktara returns itself.
  guided: boolean;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const { t } = useApp();
  const steps: StringKey[] = [
    "permissionStepOpen",
    "permissionStepSwitch",
    guided ? "permissionStepAutoReturn" : "permissionStepBack",
  ];
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("notNow")}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView
          edges={["bottom"]}
          accessibilityViewIsModal
          style={styles.sheet}
        >
          <ScrollView contentContainerStyle={{ gap: 18 }}>
            <Txt bold size={24} accessibilityRole="header">
              {t("systemPermissionTitle")}
            </Txt>
            {steps.map((step, index) => (
              <View key={step} style={styles.step}>
                <View style={styles.number}>
                  <Txt bold size={18} style={{ color: colors.white }}>
                    {index + 1}
                  </Txt>
                </View>
                <View style={{ flex: 1, gap: 12 }}>
                  <Txt size={18}>{t(step)}</Txt>
                  {step === "permissionStepSwitch" && (
                    <View style={{ alignItems: "flex-start", paddingLeft: 4 }}>
                      <GuideSwitch width={84} label={t("switchOn")} />
                    </View>
                  )}
                </View>
              </View>
            ))}
            <Txt muted size={15}>
              {t("permissionReassure")}
            </Txt>
            <Button label={t("continue")} onPress={onContinue} />
            <Button secondary label={t("notNow")} onPress={onCancel} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#21140C88",
  },
  sheet: {
    backgroundColor: colors.surface,
    padding: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    width: "100%",
    maxWidth: 640,
    maxHeight: "90%",
    alignSelf: "center",
  },
  step: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  number: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
