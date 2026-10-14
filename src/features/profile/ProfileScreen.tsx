import { useDialog } from "../../components/Dialog";
import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Bell,
  ChevronRight,
  CircleDot,
  Flame,
  Info,
  Landmark,
  Languages,
  LogIn,
  LogOut,
  LucideIcon,
  Pencil,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams, TabParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  Card,
  Chip,
  Notice,
  Page,
  Row,
  Txt,
  useUnavailable,
} from "../../components/ui";
import { backgrounds } from "../../components/backgrounds";
import { badgeArt } from "../../components/badgeArt";
import { useStats } from "../sadhana/SadhanaParts";
import { useOptionalProgression } from "../sadhana/ProgressionProvider";
import { rankNames } from "../../domain/progression";
import { colors, radii, sanctum } from "../../theme/tokens";
import { CatalogMode } from "../../domain/models";
import { StringKey } from "../../i18n/strings";
import { platformServices } from "../../services/platform";
import { useAccount } from "./AccountProvider";
import { Avatar } from "./ProfileParts";
import { earnedCount } from "./milestones";
import { useAccountActions, useMergeSummaryText } from "./useAccountActions";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Profile">,
  NativeStackScreenProps<RootParams>
>;

// Profile (doc 03 §8): who you are, how far you have come, your milestones
// a tap away, and a few large settings rows.
export function ProfileScreen({ navigation }: Props) {
  const { t, local, setLanguage, setCatalogMode, connection } = useApp();
  const unavailable = useUnavailable();
  const showDialog = useDialog();
  const stats = useStats();
  const snapshot = useOptionalProgression()?.snapshot ?? null;
  const account = useAccount();
  const { signIn, signOut } = useAccountActions({
    onAddPhoto: () => navigation.navigate("EditProfile"),
  });
  const summaryText = useMergeSummaryText();
  const name = account.profile.displayName ?? t("guestName");
  const rank = stats.real ? rankNames[stats.rank][local.language] : t("rank");
  const counters = snapshot?.counters;
  const badges = snapshot?.badges ?? [];
  return (
    <Page background={backgrounds.profile} title={t("profile")}>
      {/* Header: photo, name, rank and level. */}
      <LinearGradient
        colors={["#FFE6BC", colors.surface]}
        style={styles.header}
      >
        <Avatar
          photoKey={account.profile.photoKey}
          size={112}
          label={`${t("yourPhoto")}: ${name}`}
        />
        <Txt
          bold
          size={28}
          accessibilityRole="header"
          style={{ textAlign: "center" }}
        >
          {name}
        </Txt>
        <Chip
          label={`${rank} · ${t("level")} ${stats.level}`}
          onPress={() => showDialog(t("rank"), t("rankInfo"))}
        />
        {!account.isGuest && (
          <Txt muted size={15} style={{ textAlign: "center" }}>
            {account.email ?? t("signedInGoogle")}
          </Txt>
        )}
        <Button
          secondary
          icon={Pencil}
          label={t("editProfile")}
          onPress={() => navigation.navigate("EditProfile")}
          style={{ alignSelf: "stretch" }}
        />
      </LinearGradient>

      {account.merged && (
        <Card style={{ borderColor: colors.green }}>
          <Txt bold size={19}>
            {t("mergedText")}
          </Txt>
          {summaryText(account.merged) !== "" && (
            <Txt size={17}>{summaryText(account.merged)}</Txt>
          )}
          <Button
            secondary
            label={t("close")}
            onPress={account.dismissMerged}
          />
        </Card>
      )}
      {account.mergeLost && (
        <Card>
          <Txt bold size={18}>
            {t("mergeLost")}
          </Txt>
          <Button
            secondary
            label={t("close")}
            onPress={account.dismissMerged}
          />
        </Card>
      )}
      {account.mergePending && <Notice text={t("mergePending")} />}

      {/* Stats. */}
      <View style={styles.stats}>
        <View style={[styles.stat, styles.statWide]}>
          <Flame size={34} color={sanctum.flame} />
          <View style={{ flex: 1 }}>
            <Txt bold size={30} style={{ lineHeight: 40 }}>
              {stats.currentStreak} {t("daysUnit")}
            </Txt>
            <Txt muted size={15}>
              {t("statStreak")}
              {stats.longestStreak > 0
                ? ` · ${t("streakLongest")}: ${stats.longestStreak}`
                : ""}
            </Txt>
          </View>
        </View>
        <Stat icon={Sparkles} value={stats.totalXp} label="points" />
        <Stat icon={CircleDot} value={counters?.malas} label="statMalas" />
        <Stat
          icon={Timer}
          value={counters?.meditationMinutes}
          label="statMeditation"
        />
        <Stat
          icon={Landmark}
          value={counters?.mandirVisits}
          label="statMandir"
        />
      </View>
      {!stats.real && (
        <Txt muted size={13} style={{ textAlign: "center" }}>
          {t("sample")}
        </Txt>
      )}

      {/* Milestones, one tap away. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("milestonesTitle")}${badges.length ? `, ${earnedCount(badges)} / ${badges.length} ${t("milestonesEarned")}` : ""}`}
        onPress={() => navigation.navigate("Milestones")}
        style={({ pressed }) => [
          styles.milestones,
          pressed && { opacity: 0.8 },
        ]}
      >
        <Image
          source={badgeArt("star")}
          accessible={false}
          style={{ width: 72, height: 72 }}
        />
        <View style={{ flex: 1 }}>
          <Txt bold size={22} style={{ color: colors.white }}>
            {t("milestonesTitle")}
          </Txt>
          <Txt size={16} style={{ color: sanctum.brassLight }}>
            {badges.length
              ? `${earnedCount(badges)} / ${badges.length} ${t("milestonesEarned")}`
              : t("milestonesOpen")}
          </Txt>
        </View>
        <ChevronRight size={28} color={sanctum.brassLight} />
      </Pressable>

      {/* A soft reminder for guests, never forced (doc 21 §5). */}
      {account.isGuest && (
        <Card style={styles.keepSafe}>
          <Row>
            <ShieldCheck size={30} color={colors.green} />
            <Txt bold size={20} style={{ flex: 1 }}>
              {t("keepSafeTitle")}
            </Txt>
          </Row>
          <Txt size={16}>{t("keepSafeText")}</Txt>
          <Button
            icon={LogIn}
            label={account.busy === "signIn" ? t("signingIn") : t("signIn")}
            disabled={account.busy !== null}
            onPress={() =>
              account.available ? void signIn() : unavailable("authUnavailable")
            }
          />
        </Card>
      )}

      {/* Settings: large rows. */}
      <Txt bold size={21}>
        {t("settings")}
      </Txt>
      <Card style={{ paddingVertical: 6, gap: 0 }}>
        <View style={styles.row}>
          <Languages size={24} color={colors.primary} />
          <Txt bold size={17} style={{ flex: 1 }}>
            {t("language")}
          </Txt>
          <Chip
            label={local.language === "hi" ? "English" : "हिन्दी"}
            onPress={() => setLanguage(local.language === "hi" ? "en" : "hi")}
          />
        </View>
        <SettingRow
          icon={Bell}
          label="notifications"
          onPress={() => {
            void platformServices.notifications.request();
            unavailable("notificationUnavailable");
          }}
        />
        {account.isGuest ? (
          <SettingRow
            icon={LogIn}
            label="signIn"
            onPress={() =>
              account.available ? void signIn() : unavailable("authUnavailable")
            }
          />
        ) : (
          <SettingRow
            icon={LogOut}
            label={account.busy === "signOut" ? "signingOut" : "signOut"}
            onPress={signOut}
          />
        )}
        <SettingRow
          icon={ShieldCheck}
          label="privacy"
          onPress={() =>
            showDialog(
              t("privacy"),
              t(
                connection === "emulator"
                  ? "emulatorPrivacy"
                  : connection === "cloud"
                    ? "cloudPrivacy"
                    : "privacyText",
              ),
            )
          }
        />
        <SettingRow
          icon={Info}
          label="about"
          last
          onPress={() => showDialog(t("about"), t("aboutText"))}
        />
      </Card>
      {connection === "fixture" && <Notice text={t("localOnly")} />}
      {__DEV__ && (
        <Card>
          <Txt bold size={12}>
            Developer preview states
          </Txt>
          <Row style={{ flexWrap: "wrap" }}>
            {(
              ["ready", "loading", "empty", "error", "offline"] as CatalogMode[]
            ).map((mode) => (
              <Chip
                key={mode}
                label={mode}
                onPress={() => setCatalogMode(mode)}
              />
            ))}
          </Row>
        </Card>
      )}
      <Txt muted size={12} style={{ textAlign: "center" }}>
        Bhaktara · 0.1.0
      </Txt>
    </Page>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number | undefined;
  label: StringKey;
}) {
  const { t } = useApp();
  return (
    <View
      style={styles.stat}
      accessible
      accessibilityLabel={`${t(label)}: ${value ?? "—"}`}
    >
      <Icon size={26} color={colors.gold} />
      <View style={{ flex: 1 }}>
        <Txt bold size={24} style={{ lineHeight: 34 }}>
          {value ?? "—"}
        </Txt>
        <Txt muted size={14}>
          {t(label)}
        </Txt>
      </View>
    </View>
  );
}

function SettingRow({
  icon: Icon,
  label,
  onPress,
  last,
}: {
  icon: LucideIcon;
  label: StringKey;
  onPress: () => void;
  last?: boolean;
}) {
  const { t } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowLine,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon size={24} color={colors.primary} />
      <Txt size={17} style={{ flex: 1 }}>
        {t(label)}
      </Txt>
      <ChevronRight size={22} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    gap: 10,
    padding: 22,
    marginTop: 8,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    minHeight: 76,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statWide: { flexBasis: "100%", backgroundColor: "#FFF1D6" },
  milestones: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 96,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: sanctum.maroon,
    borderWidth: 1.5,
    borderColor: sanctum.brass,
  },
  keepSafe: { backgroundColor: colors.greenPale, borderColor: "#BFDDB5" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 60,
    paddingVertical: 8,
  },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
