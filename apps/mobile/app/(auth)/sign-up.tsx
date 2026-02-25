/**
 * Sign-up screen for the PullUp app.
 *
 * Collects the user's full name, email, password, role (rider or driver),
 * and an optional referral code. Displays inline validation errors.
 * All form controls carry accessibility labels, roles, and selection
 * states so that screen readers can guide users through registration.
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, type UserRole } from "../../lib/auth";

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("rider");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: signUpError } = await signUp({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      role,
      referralCode: referralCode.trim() || undefined,
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>
            Join PullUp and start saving
          </Text>

          {error && (
            <View
              style={styles.errorBox}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="John Doe"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
                editable={!loading}
                accessibilityLabel="Full name"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                accessibilityLabel="Email address"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                editable={!loading}
                accessibilityLabel="Password"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>I am a...</Text>
              <View style={styles.roleRow}>
                <Pressable
                  style={[
                    styles.roleOption,
                    role === "rider" && styles.roleOptionActive,
                  ]}
                  onPress={() => setRole("rider")}
                  disabled={loading}
                  accessibilityLabel="Select rider role"
                  accessibilityRole="button"
                  accessibilityState={{ selected: role === "rider" }}
                >
                  <Text style={styles.roleIcon}>🏍</Text>
                  <Text
                    style={[
                      styles.roleText,
                      role === "rider" && styles.roleTextActive,
                    ]}
                  >
                    Rider
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.roleOption,
                    role === "driver" && styles.roleOptionActive,
                  ]}
                  onPress={() => setRole("driver")}
                  disabled={loading}
                  accessibilityLabel="Select driver role"
                  accessibilityRole="button"
                  accessibilityState={{ selected: role === "driver" }}
                >
                  <Text style={styles.roleIcon}>🚗</Text>
                  <Text
                    style={[
                      styles.roleText,
                      role === "driver" && styles.roleTextActive,
                    ]}
                  >
                    Driver
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Referral Code (optional)</Text>
              <TextInput
                style={styles.input}
                value={referralCode}
                onChangeText={setReferralCode}
                placeholder="Enter driver referral code"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                editable={!loading}
                accessibilityLabel="Referral code"
              />
            </View>

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={loading}
              accessibilityLabel="Create account"
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" accessibilityLabel="Loading" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href="/(auth)/sign-in" asChild>
                <Pressable
                  accessibilityLabel="Sign in"
                  accessibilityRole="button"
                >
                  <Text style={styles.footerLink}>Sign In</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  backButton: {
    marginBottom: 24,
  },
  backText: {
    fontSize: 16,
    color: "#6C63FF",
    fontWeight: "500",
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
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#1A1A2E",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  roleRow: {
    flexDirection: "row",
    gap: 12,
  },
  roleOption: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    gap: 4,
  },
  roleOptionActive: {
    borderColor: "#6C63FF",
    backgroundColor: "#F0EFFF",
  },
  roleIcon: {
    fontSize: 24,
  },
  roleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  roleTextActive: {
    color: "#6C63FF",
  },
  button: {
    backgroundColor: "#6C63FF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
  footerText: {
    fontSize: 14,
    color: "#6B7280",
  },
  footerLink: {
    fontSize: 14,
    color: "#6C63FF",
    fontWeight: "600",
  },
});
