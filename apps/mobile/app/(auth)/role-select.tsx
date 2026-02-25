import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function RoleSelectScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>How will you use PullUp?</Text>
        <Text style={styles.subtitle}>
          Choose your role to get started. You can change this later in settings.
        </Text>

        <View style={styles.cards}>
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/(auth)/sign-up",
                params: { role: "rider" },
              })
            }
          >
            <View style={styles.cardIconContainer}>
              <Text style={styles.cardIcon}>🏍</Text>
            </View>
            <Text style={styles.cardTitle}>I'm a Rider</Text>
            <Text style={styles.cardDescription}>
              Browse deals from local venues, claim discounts, and save money on
              every visit.
            </Text>
            <View style={styles.cardBullets}>
              <Text style={styles.bullet}>- Discover nearby deals</Text>
              <Text style={styles.bullet}>- Claim exclusive discounts</Text>
              <Text style={styles.bullet}>- Scan QR codes at venues</Text>
            </View>
          </Pressable>

          <Pressable
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/(auth)/sign-up",
                params: { role: "driver" },
              })
            }
          >
            <View style={[styles.cardIconContainer, styles.driverIconBg]}>
              <Text style={styles.cardIcon}>🚗</Text>
            </View>
            <Text style={styles.cardTitle}>I'm a Driver</Text>
            <Text style={styles.cardDescription}>
              Refer riders to venues, earn commissions, and build your network.
            </Text>
            <View style={styles.cardBullets}>
              <Text style={styles.bullet}>- Share your referral code</Text>
              <Text style={styles.bullet}>- Earn on every referred claim</Text>
              <Text style={styles.bullet}>- Track your earnings</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    paddingHorizontal: 24,
  },
  backButton: {
    marginTop: 16,
    marginBottom: 16,
  },
  backText: {
    fontSize: 16,
    color: "#6C63FF",
    fontWeight: "500",
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 32,
    lineHeight: 22,
  },
  cards: {
    gap: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F0EFFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  driverIconBg: {
    backgroundColor: "#E8FFF0",
  },
  cardIcon: {
    fontSize: 28,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 12,
  },
  cardBullets: {
    gap: 4,
  },
  bullet: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
});
