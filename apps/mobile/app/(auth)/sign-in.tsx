/**
 * Sign-in screen for the PullUp app.
 *
 * Provides email and password fields with a submit button. Displays
 * inline error messages when authentication fails. All form controls
 * carry accessibility labels and roles so that screen readers can
 * guide users through the sign-in flow.
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
import { useAuth } from "../../lib/auth";

// Public portfolio demo accounts. Set only for demo builds; hidden otherwise.
const DEMO_ACCOUNTS = [
  {
    role: "rider",
    label: "Demo rider",
    email: process.env.EXPO_PUBLIC_DEMO_RIDER_EMAIL,
    password: process.env.EXPO_PUBLIC_DEMO_RIDER_PASSWORD,
  },
  {
    role: "driver",
    label: "Demo driver",
    email: process.env.EXPO_PUBLIC_DEMO_DRIVER_EMAIL,
    password: process.env.EXPO_PUBLIC_DEMO_DRIVER_PASSWORD,
  },
].filter((a): a is { role: string; label: string; email: string; password: string } => !!a.email && !!a.password);

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInAs = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setLoading(true);
    setError(null);
    const { error: signInError } = await signIn(demoEmail, demoPassword);
    setLoading(false);
    if (signInError) setError(signInError);
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: signInError } = await signIn(email.trim(), password);
    setLoading(false);

    if (signInError) {
      setError(signInError);
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

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to your PullUp account
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

          {DEMO_ACCOUNTS.length > 0 && (
            <View style={styles.demoBox}>
              <Text style={styles.demoTitle}>Just looking around?</Text>
              <Text style={styles.demoText}>Sign in to an account with sample activity.</Text>
              <View style={styles.demoRow}>
                {DEMO_ACCOUNTS.map((a) => (
                  <Pressable
                    key={a.role}
                    style={[styles.demoButton, loading && styles.buttonDisabled]}
                    onPress={() => signInAs(a.email, a.password)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={`Sign in as ${a.label.toLowerCase()}`}
                  >
                    <Text style={styles.demoButtonText}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#6B7280"
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
                placeholder="Enter your password"
                placeholderTextColor="#6B7280"
                secureTextEntry
                editable={!loading}
                accessibilityLabel="Password"
              />
              <Link href="/reset-password" asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password?"
                  style={styles.forgotButton}
                  hitSlop={8}
                >
                  <Text style={styles.footerLink}>Forgot password?</Text>
                </Pressable>
              </Link>
            </View>

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={loading}
              accessibilityLabel="Sign in"
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" accessibilityLabel="Loading" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <Link href="/(auth)/sign-up" asChild>
                <Pressable
                  accessibilityLabel="Sign up"
                  accessibilityRole="button"
                >
                  <Text style={styles.footerLink}>Sign Up</Text>
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
  },
  backButton: {
    marginBottom: 24,
  },
  backText: {
    fontSize: 16,
    color: "#5B53EE",
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
    color: "#B91C1C",
    fontSize: 14,
  },
  demoBox: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 4,
  },
  demoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  demoText: {
    fontSize: 14,
    color: "#4B5563",
  },
  demoRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  demoButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#5B53EE",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  demoButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5B53EE",
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
    borderColor: "#6B7280",
  },
  button: {
    backgroundColor: "#5B53EE",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#5B53EE",
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
  forgotButton: {
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
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
    color: "#5B53EE",
    fontWeight: "600",
  },
});
