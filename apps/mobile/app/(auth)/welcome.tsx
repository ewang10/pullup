/**
 * Welcome screen for the PullUp app.
 *
 * Displays the brand hero section with the PullUp logo, tagline, and
 * subtitle, followed by primary "Sign in" and secondary "Create account"
 * buttons. All interactive and heading elements carry accessibility
 * roles and labels for screen-reader support.
 */

import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.heroSection}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText} maxFontSizeMultiplier={1.4} accessibilityRole="header">
            PullUp
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.5} style={styles.tagline}>
          Exclusive deals.{"\n"}Right around the corner.
        </Text>
        <Text style={styles.subtitle}>
          Claim deals at local venues and get ride credit for the trip there.
          Driving for Uber or Lyft? Earn a bonus when your passengers use PullUp.
        </Text>
      </View>

      <View style={styles.buttonSection}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push("/(auth)/sign-in")}
          accessibilityLabel="Sign in to your account"
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Sign in</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push("/(auth)/sign-up")}
          accessibilityLabel="Create a new account"
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Create account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  heroSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: "#5B53EE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
    shadowColor: "#5B53EE",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1A1A2E",
    textAlign: "center",
    lineHeight: 40,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  buttonSection: {
    paddingBottom: 32,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#5B53EE",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#5B53EE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#5B53EE",
  },
  secondaryButtonText: {
    color: "#5B53EE",
    fontSize: 17,
    fontWeight: "600",
  },
});
