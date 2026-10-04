import React from "react";
import { Pressable, View } from "react-native";
import {
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Compass,
  Flower2,
  House,
  Sprout,
  UserRound,
} from "lucide-react-native";
import { RootParams, TabParams } from "./routes";
import { useApp } from "../providers/AppProvider";
import { colors } from "../../theme/tokens";
import { Txt } from "../../components/ui";
import { HomeScreen } from "../../features/home/HomeScreen";
import { ExploreScreen } from "../../features/explore/ExploreScreen";
import { MandirScreen } from "../../features/mandir/MandirScreen";
import { SadhanaScreen } from "../../features/sadhana/SadhanaScreen";
import { ProfileScreen } from "../../features/profile/ProfileScreen";
import { ContentScreen } from "../../features/content/ContentScreen";
import { PlayerScreen } from "../../features/player/PlayerScreen";
import { MiniPlayer } from "../../features/player/MiniPlayer";
import {
  JaapScreen,
  MeditationScreen,
  PrayerScreen,
} from "../../features/sadhana/PracticeScreens";
import { StringKey } from "../../i18n/strings";
const Tabs = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RootParams>();
const ref = createNavigationContainerRef<RootParams>();
const icons = {
  Home: House,
  Explore: Compass,
  Mandir: Flower2,
  Sadhana: Sprout,
  Profile: UserRound,
};
function TabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View>
      <MiniPlayer onOpen={() => ref.navigate("Player")} />
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderColor: colors.line,
          paddingTop: 7,
          paddingBottom: Math.max(10, insets.bottom),
        }}
      >
        {state.routes.map((route, index) => {
          const active = state.index === index;
          const Icon = icons[route.name as keyof TabParams];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(route.name.toLowerCase() as StringKey)}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!active && !event.defaultPrevented)
                  navigation.navigate(route.name);
              }}
              onLongPress={() =>
                navigation.emit({ type: "tabLongPress", target: route.key })
              }
              style={{
                flex: 1,
                minHeight: 59,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <View
                style={{
                  paddingHorizontal: 15,
                  paddingVertical: 4,
                  borderRadius: 20,
                  backgroundColor: active ? colors.pale : "transparent",
                }}
              >
                <Icon
                  size={23}
                  color={active ? colors.primary : colors.muted}
                  strokeWidth={active ? 2.2 : 1.7}
                />
              </View>
              <Txt
                size={12}
                bold={active}
                style={{ color: active ? colors.primary : colors.muted }}
              >
                {t(route.name.toLowerCase() as StringKey)}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
function MainTabs() {
  return (
    <Tabs.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Explore" component={ExploreScreen} />
      <Tabs.Screen name="Mandir" component={MandirScreen} />
      <Tabs.Screen name="Sadhana" component={SadhanaScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}
export function AppNavigator() {
  return (
    <NavigationContainer
      ref={ref}
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: colors.background,
          card: colors.surface,
          text: colors.ink,
          primary: colors.primary,
          border: colors.line,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: "none",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Content" component={ContentScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} />
        <Stack.Screen name="Jaap" component={JaapScreen} />
        <Stack.Screen name="Meditation" component={MeditationScreen} />
        <Stack.Screen name="Prayer" component={PrayerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
