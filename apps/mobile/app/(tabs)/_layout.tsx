/**
 * Tab bar layout for the PullUp mobile app.
 *
 * Renders a modern floating-style bottom tab bar with Ionicon icons.
 * Tabs are conditionally shown based on the authenticated user's role:
 *   - Riders see: Deals map, Browse, Claims, Profile
 *   - Drivers see: Deals map, Browse, Referrals, Earnings, Profile
 *
 * Each tab includes an accessibility label so screen readers can
 * announce the destination clearly.
 */

import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface TabIconProps {
  name: string;
  focused: boolean;
}

const iconMap: Record<string, { filled: IoniconsName; outline: IoniconsName }> = {
  map: { filled: "map", outline: "map-outline" },
  deals: { filled: "pricetag", outline: "pricetag-outline" },
  claims: { filled: "clipboard", outline: "clipboard-outline" },
  referrals: { filled: "people", outline: "people-outline" },
  earnings: { filled: "wallet", outline: "wallet-outline" },
  profile: { filled: "person", outline: "person-outline" },
};

function TabIcon({ name, focused }: TabIconProps) {
  const entry = iconMap[name] ?? iconMap.map;
  const iconName = focused ? entry.filled : entry.outline;

  return (
    <Ionicons
      name={iconName}
      size={24}
      color={focused ? "#6C63FF" : "#9CA3AF"}
    />
  );
}

export default function TabsLayout() {
  const { role } = useAuth();
  const isDriver = role === "driver";

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#FFFFFF" },
        headerTitleStyle: { color: "#1A1A2E", fontWeight: "600" },
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: "#6C63FF",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Deals",
          headerTitle: "Nearby Deals",
          tabBarAccessibilityLabel: "Navigate to Deals map",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="map" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: "Browse",
          headerTitle: "Browse Deals",
          tabBarAccessibilityLabel: "Browse deals list",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="deals" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="claims"
        options={{
          title: "My Claims",
          headerTitle: "My Claims",
          tabBarAccessibilityLabel: "View my claimed deals",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="claims" focused={focused} />
          ),
          href: isDriver ? null : "/(tabs)/claims",
        }}
      />
      <Tabs.Screen
        name="referrals"
        options={{
          title: "Referrals",
          headerTitle: "Referrals",
          tabBarAccessibilityLabel: "Manage referrals",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="referrals" focused={focused} />
          ),
          href: isDriver ? "/(tabs)/referrals" : null,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          headerTitle: "Earnings",
          tabBarAccessibilityLabel: "View earnings summary",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="earnings" focused={focused} />
          ),
          href: isDriver ? "/(tabs)/earnings" : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          headerTitle: "Profile",
          tabBarAccessibilityLabel: "Open your profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 0,
    height: 88,
    paddingBottom: 28,
    paddingTop: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
    position: "absolute",
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
});
