import React from "react";
import {
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RootParams, TabParams } from "./routes";
import { TabBar, useReducedMotion } from "./TabBar";
import { colors, sanctum } from "../../theme/tokens";
import { HomeScreen } from "../../features/home/HomeScreen";
import { ExploreScreen } from "../../features/explore/ExploreScreen";
import { ChooseDeityScreen } from "../../features/explore/ChooseDeityScreen";
import { DeityContentScreen } from "../../features/explore/DeityContentScreen";
import { MandirScreen } from "../../features/mandir/MandirScreen";
import { SadhanaScreen } from "../../features/sadhana/SadhanaScreen";
import { ProfileScreen } from "../../features/profile/ProfileScreen";
import { ContentScreen } from "../../features/content/ContentScreen";
import { PlayerScreen } from "../../features/player/PlayerScreen";
import {
  JaapScreen,
  MeditationScreen,
  PrayerScreen,
} from "../../features/sadhana/PracticeScreens";
const Tabs = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RootParams>();
const ref = createNavigationContainerRef<RootParams>();
function MainTabs() {
  const reduced = useReducedMotion();
  return (
    <Tabs.Navigator
      tabBar={(props) => (
        <TabBar {...props} onOpenPlayer={() => ref.navigate("Player")} />
      )}
      // A brief fade keeps tab switches calm without delaying the next screen.
      screenOptions={{
        headerShown: false,
        animation: reduced ? "none" : "fade",
      }}
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
  const reduced = useReducedMotion();
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
      {/* Native transitions (they stay smooth while JS is busy): pages slide
          in from the right and back out; the full-screen viewers cross-fade
          on their dark ground so going back never flashes. */}
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: reduced ? "none" : "slide_from_right",
          animationDuration: 250,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Content" component={ContentScreen} />
        <Stack.Screen name="ChooseDeity" component={ChooseDeityScreen} />
        <Stack.Screen
          name="DeityContent"
          component={DeityContentScreen}
          options={{
            animation: reduced ? "none" : "fade",
            contentStyle: { backgroundColor: sanctum.night },
          }}
        />
        <Stack.Screen name="Player" component={PlayerScreen} />
        <Stack.Screen name="Jaap" component={JaapScreen} />
        <Stack.Screen name="Meditation" component={MeditationScreen} />
        <Stack.Screen name="Prayer" component={PrayerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
