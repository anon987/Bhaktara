import React from "react";
import { ScrollView, View } from "react-native";
import { Check, Flower2 } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../../app/providers/AppProvider";
import { Button, Card, Row, Txt } from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { colors } from "../../theme/tokens";
export function OnboardingScreen() {
  const { local, t, setLanguage, update } = useApp();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: 28,
          paddingTop: 36,
          gap: 25,
          flexGrow: 1,
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Row style={{ justifyContent: "center" }}>
          <Flower2 size={28} color={colors.primary} />
          <Txt bold size={28}>
            Bhaktara
          </Txt>
        </Row>
        <DevotionalArt assetKey="placeholder/ganesha" size={230} />
        <View>
          <Txt bold size={30} style={{ textAlign: "center" }}>
            {t("welcome")}
          </Txt>
          <Txt muted style={{ textAlign: "center", marginTop: 12 }}>
            {t("chooseLanguage")}
          </Txt>
        </View>
        <Card>
          <Button
            secondary={local.language !== "hi"}
            icon={local.language === "hi" ? Check : undefined}
            label="हिन्दी"
            onPress={() => setLanguage("hi")}
          />
          <Button
            secondary={local.language !== "en"}
            icon={local.language === "en" ? Check : undefined}
            label="English"
            onPress={() => setLanguage("en")}
          />
        </Card>
        <Txt size={12} muted style={{ textAlign: "center" }}>
          {t("languageHint")}
        </Txt>
        <Button
          label={t("continue")}
          onPress={() => update((state) => ({ ...state, onboarded: true }))}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
