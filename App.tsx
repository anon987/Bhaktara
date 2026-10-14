import { DialogProvider } from "./src/components/Dialog";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { DMSans_400Regular, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_700Bold,
} from "@expo-google-fonts/noto-sans-devanagari";
import { AppProvider, useApp } from "./src/app/providers/AppProvider";
import { AppNavigator } from "./src/app/navigation/AppNavigator";
import { PlayerProvider } from "./src/features/player/PlayerProvider";
import { ProgressionProvider } from "./src/features/sadhana/ProgressionProvider";
import { BlessingSheet } from "./src/features/sadhana/BlessingSheet";
import { AccountProvider } from "./src/features/profile/AccountProvider";
import { SettingsGuideOverlay } from "./src/features/content/SettingsGuideOverlay";
import { OnboardingScreen } from "./src/features/onboarding/OnboardingScreen";
import { colors } from "./src/theme/tokens";
import { Button, Txt } from "./src/components/ui";
export function AppContent() {
  const { local, ready, storageError, retryStorage, t } = useApp();
  return !ready ? (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 20,
      }}
    >
      {storageError ? (
        <>
          <Txt accessibilityRole="alert">{t("storageLoadError")}</Txt>
          <Button label={t("retry")} onPress={retryStorage} />
        </>
      ) : (
        <ActivityIndicator color={colors.primary} />
      )}
    </View>
  ) : local.onboarded ? (
    <PlayerProvider>
      <ProgressionProvider>
        {/* Profile, Google sign-in and the guest merge (doc 21). */}
        <AccountProvider>
          <AppNavigator />
        </AccountProvider>
        {/* XP, streak and milestones after a recorded practice. */}
        <BlessingSheet />
      </ProgressionProvider>
      {/* Fills Bhaktara's picture-in-picture window during the ringtone permission. */}
      <SettingsGuideOverlay />
    </PlayerProvider>
  ) : (
    <OnboardingScreen />
  );
}
export default function App() {
  const [loaded, error] = useFonts({
    DMSans: DMSans_400Regular,
    DMSansBold: DMSans_700Bold,
    NotoDevanagari: NotoSansDevanagari_400Regular,
    NotoDevanagariBold: NotoSansDevanagari_700Bold,
  });
  if (!loaded && !error)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  if (error)
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 30 }}>
        <Text>
          Bhaktara fonts could not load. Please restart the app. / कृपया ऐप फिर
          खोलें।
        </Text>
      </View>
    );
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <DialogProvider>
          <AppContent />
        </DialogProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
