import { View, Text, StyleSheet, Pressable, Alert, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { useAppStore } from "../../lib/store";
import { DEMO_ACCOUNT_LOCKED_TEXT, isDemoAccountEmail } from "@pullup/shared";

// Help and legal pages live on the public website so they can change without an app update.
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? "https://pullup-kappa-gray.vercel.app";
const HELP_LINKS = [
  { path: "/faq", label: "Help & FAQ" },
  { path: "/how-it-works", label: "How PullUp works" },
  { path: "/support", label: "Contact support" },
  { path: "/privacy", label: "Privacy policy" },
  { path: "/terms", label: "Terms of service" },
];

export default function ProfileScreen() {
  const { user, profile, driverProfile, role, signOut } = useAuth();
  const reset = useAppStore((s) => s.reset);
  const router = useRouter();

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          reset();
          await signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText} maxFontSizeMultiplier={1.4}>
              {profile?.full_name
                ? profile.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                : "?"}
            </Text>
          </View>
        </View>

        <Text maxFontSizeMultiplier={1.5} style={styles.name}>{profile?.full_name ?? "User"}</Text>
        <Text style={styles.email} maxFontSizeMultiplier={1.5}>{user?.email ?? ""}</Text>

        <View style={styles.roleBadge}>
          <Text style={styles.roleText} maxFontSizeMultiplier={1.5}>
            {role === "driver" ? "Driver" : "Rider"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.5}>Account</Text>

          <View style={styles.menuItem}>
            <Text style={styles.menuLabel}>Full name</Text>
            <Text style={styles.menuValue}>
              {profile?.full_name ?? "-"}
            </Text>
          </View>

          <View style={styles.menuItem}>
            <Text style={styles.menuLabel}>Email</Text>
            <Text style={styles.menuValue}>{user?.email ?? "-"}</Text>
          </View>

          <View style={styles.menuItem}>
            <Text style={styles.menuLabel}>Role</Text>
            <Text style={styles.menuValue}>
              {role === "driver" ? "Driver" : "Rider"}
            </Text>
          </View>

          {driverProfile?.referral_code && (
            <View style={styles.menuItem}>
              <Text style={styles.menuLabel}>Driver code</Text>
              <Text style={styles.menuValueHighlight}>
                {driverProfile.referral_code}
              </Text>
            </View>
          )}

          <View style={styles.menuItem}>
            <Text style={styles.menuLabel}>Member since</Text>
            <Text style={styles.menuValue}>
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString()
                : "-"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Settings</Text>

          {isDemoAccountEmail(user?.email) ? (
            <View style={styles.menuButton}>
              <Text style={styles.menuNote}>{DEMO_ACCOUNT_LOCKED_TEXT}</Text>
            </View>
          ) : (
            <Pressable
              style={styles.menuButton}
              onPress={() => router.push("/reset-password")}
              accessibilityRole="button"
              accessibilityLabel="Change password"
            >
              <Text style={styles.menuLabel}>Change password</Text>
              <Text style={styles.menuChevron} aria-hidden>&gt;</Text>
            </Pressable>
          )}

        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Help</Text>
          {HELP_LINKS.map((l) => (
            <Pressable
              key={l.path}
              style={styles.menuButton}
              onPress={() => Linking.openURL(`${SITE_URL}${l.path}`)}
              accessibilityRole="link"
              accessibilityLabel={l.label}
              accessibilityHint="Opens in your browser"
            >
              <Text style={styles.menuLabel}>{l.label}</Text>
              <Text style={styles.menuChevron} aria-hidden>↗</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.signOutButton}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <Text style={styles.version}>PullUp v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  avatarContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#5B53EE",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A2E",
    textAlign: "center",
  },
  email: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 8,
  },
  roleBadge: {
    alignSelf: "center",
    backgroundColor: "#F0EFFF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 24,
  },
  roleText: {
    color: "#5B53EE",
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  // Wraps so long values (like an email) drop below the label at large text sizes.
  menuItem: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 2,
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuNote: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#4B5563",
  },
  menuLabel: {
    fontSize: 15,
    color: "#1A1A2E",
  },
  menuValue: {
    fontSize: 15,
    color: "#4B5563",
    flexShrink: 1,
  },
  menuValueHighlight: {
    fontSize: 15,
    color: "#5B53EE",
    fontWeight: "600",
  },
  menuChevron: {
    fontSize: 16,
    color: "#6B7280",
  },
  signOutButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DC2626",
    marginTop: 8,
  },
  signOutText: {
    color: "#B91C1C",
    fontSize: 16,
    fontWeight: "600",
  },
  version: {
    textAlign: "center",
    color: "#6B7280",
    fontSize: 12,
    marginTop: 16,
  },
});
