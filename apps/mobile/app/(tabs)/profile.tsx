import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth";
import { useAppStore } from "../../lib/store";

export default function ProfileScreen() {
  const { user, profile, driverProfile, role, signOut } = useAuth();
  const reset = useAppStore((s) => s.reset);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
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
      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
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

        <Text style={styles.name}>{profile?.full_name ?? "User"}</Text>
        <Text style={styles.email}>{user?.email ?? ""}</Text>

        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>
            {role === "driver" ? "Driver" : "Rider"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.menuItem}>
            <Text style={styles.menuLabel}>Full Name</Text>
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
              <Text style={styles.menuLabel}>Referral Code</Text>
              <Text style={styles.menuValueHighlight}>
                {driverProfile.referral_code}
              </Text>
            </View>
          )}

          <View style={styles.menuItem}>
            <Text style={styles.menuLabel}>Member Since</Text>
            <Text style={styles.menuValue}>
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString()
                : "-"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>

          <Pressable style={styles.menuButton}>
            <Text style={styles.menuLabel}>Notifications</Text>
            <Text style={styles.menuChevron}>&gt;</Text>
          </Pressable>

          <Pressable style={styles.menuButton}>
            <Text style={styles.menuLabel}>Privacy</Text>
            <Text style={styles.menuChevron}>&gt;</Text>
          </Pressable>

          <Pressable style={styles.menuButton}>
            <Text style={styles.menuLabel}>Help & Support</Text>
            <Text style={styles.menuChevron}>&gt;</Text>
          </Pressable>
        </View>

        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        <Text style={styles.version}>PullUp v1.0.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  avatarContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#6C63FF",
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
    color: "#6C63FF",
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
  menuItem: {
    flexDirection: "row",
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
  menuLabel: {
    fontSize: 15,
    color: "#1A1A2E",
  },
  menuValue: {
    fontSize: 15,
    color: "#6B7280",
  },
  menuValueHighlight: {
    fontSize: 15,
    color: "#6C63FF",
    fontWeight: "600",
  },
  menuChevron: {
    fontSize: 16,
    color: "#9CA3AF",
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
    color: "#DC2626",
    fontSize: 16,
    fontWeight: "600",
  },
  version: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 16,
  },
});
