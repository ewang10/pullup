/**
 * Sign-up screen for the PullUp app.
 *
 * Collects the user's full name, email, password and role (rider or driver).
 * Displays inline validation errors.
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
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, type UserRole } from "../../lib/auth";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_TEXT,
  validatePassword,
  RIDESHARE_PLATFORMS,
  type RidesharePlatform,
} from "@pullup/shared";

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("rider");
  // Drivers: details staff use to verify they actively drive for a rideshare company.
  const [phone, setPhone] = useState("");
  const [platform, setPlatform] = useState<RidesharePlatform | null>(null);
  const [driverId, setDriverId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (role === "driver") {
      if (phone.replace(/\D/g, "").length < 10) {
        setError("Enter your mobile number so we can reach you about your application.");
        return;
      }
      if (!platform || !driverId.trim()) {
        setError("Choose your rideshare platform and enter your driver ID so we can verify you.");
        return;
      }
    }

    setLoading(true);
    setError(null);

    const { error: signUpError } = await signUp({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      role,
      ...(role === "driver"
        ? { phone: phone.trim(), ridesharePlatform: platform!, rideshareDriverId: driverId.trim() }
        : {}),
    });

    setLoading(false);

    if (signUpError) {
      setError(
        /users_phone/.test(signUpError)
          ? "That phone number is already used by another account."
          : signUpError
      );
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
            Get ride credit for local deals, or earn bonuses as a driver.
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
              <Text style={styles.label}>Full name</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Alex Kim"
                placeholderTextColor="#6B7280"
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
                placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                placeholderTextColor="#6B7280"
                secureTextEntry
                editable={!loading}
                accessibilityLabel="Password"
                accessibilityHint={PASSWORD_REQUIREMENTS_TEXT}
              />
              <Text style={styles.hint}>{PASSWORD_REQUIREMENTS_TEXT}</Text>
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
                  <Ionicons name="person-outline" size={24} color={role === "rider" ? "#5B53EE" : "#4B5563"} accessible={false} />
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
                  <Ionicons name="car-outline" size={24} color={role === "driver" ? "#5B53EE" : "#4B5563"} accessible={false} />
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

            {role === "driver" && (
              <View style={styles.driverSection}>
                <Text style={styles.driverIntro}>
                  We verify every driver before they can earn bonuses. Our team checks these details, usually within
                  1–2 business days.
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Mobile number</Text>
                  <TextInput
                    style={styles.input}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="(916) 555-0123"
                    placeholderTextColor="#6B7280"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    editable={!loading}
                    accessibilityLabel="Mobile number"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label} nativeID="platform-label">
                    Which rideshare app do you drive for?
                  </Text>
                  <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabelledBy="platform-label">
                    {RIDESHARE_PLATFORMS.map((p) => (
                      <Pressable
                        key={p.value}
                        onPress={() => setPlatform(p.value)}
                        style={[styles.chip, platform === p.value && styles.chipActive]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: platform === p.value }}
                        accessibilityLabel={p.label}
                      >
                        <Text style={[styles.chipText, platform === p.value && styles.chipTextActive]}>{p.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Your driver ID on that app</Text>
                  <TextInput
                    style={styles.input}
                    value={driverId}
                    onChangeText={setDriverId}
                    placeholder="Found in your driver app's profile"
                    placeholderTextColor="#6B7280"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    accessibilityLabel="Rideshare driver ID"
                  />
                </View>
              </View>
            )}

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
                <Text style={styles.buttonText}>Create account</Text>
              )}
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href="/(auth)/sign-in" asChild>
                <Pressable
                  accessibilityLabel="Sign in"
                  accessibilityRole="button"
                >
                  <Text style={styles.footerLink}>Sign in</Text>
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
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 6,
  },
  hint: {
    fontSize: 12,
    color: "#6B7280",
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
  driverSection: {
    gap: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
  },
  driverIntro: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#6B7280",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  chipActive: {
    borderColor: "#5B53EE",
    backgroundColor: "#F0EFFF",
  },
  chipText: {
    fontSize: 15,
    color: "#1A1A2E",
  },
  chipTextActive: {
    color: "#3F37C9",
    fontWeight: "600",
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
    borderColor: "#6B7280",
    gap: 4,
  },
  roleOptionActive: {
    borderColor: "#5B53EE",
    backgroundColor: "#F0EFFF",
  },
  roleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  roleTextActive: {
    color: "#5B53EE",
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
