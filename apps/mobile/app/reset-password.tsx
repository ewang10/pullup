/**
 * Reset or change password with an emailed one-time code.
 *
 * Used both signed out ("Forgot password?") and signed in ("Change password").
 * Step 1 emails a recovery code; step 2 verifies it and sets the new password.
 * Staying in the app avoids deep links, and the emailed code satisfies
 * Supabase's "secure password change" reauthentication.
 *
 * Requires the Supabase "Reset password" email template to include {{ .Token }}.
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
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEMO_ACCOUNT_LOCKED_TEXT, PASSWORD_REQUIREMENTS_TEXT, isDemoAccountEmail, validatePassword } from "@pullup/shared";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

type Step = "email" | "code" | "done";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const signedInEmail = session?.user.email ?? "";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(signedInEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Once the code is verified it can't be reused, so a failed password update
  // (e.g. a weak password) retries with the new session instead.
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const sendCode = async () => {
    const target = email.trim();
    if (!target) {
      setError("Enter the email address for your account.");
      return;
    }
    if (isDemoAccountEmail(target)) {
      setError(DEMO_ACCOUNT_LOCKED_TEXT);
      return;
    }
    setLoading(true);
    setError(null);
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(target);
    setLoading(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    setInfo(`We sent a code to ${target}. It can take a minute to arrive; check spam too.`);
    setStep("code");
  };

  const savePassword = async () => {
    const passwordError = validatePassword(password);
    if (passwordError) return setError(passwordError);
    if (password !== confirm) return setError("Passwords don't match.");
    if (!verified && !code.trim()) return setError("Enter the code from the email.");

    setLoading(true);
    setError(null);

    if (!verified) {
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "recovery",
      });
      if (otpError) {
        setLoading(false);
        return setError("That code didn't work. Check it, or send a new one.");
      }
      setVerified(true);
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      return setError(/demo_account_locked/.test(updateError.message) ? DEMO_ACCOUNT_LOCKED_TEXT : updateError.message);
    }
    setStep("done");
  };

  const finish = () => {
    // Verifying the code signs the user in, so go straight into the app.
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const title = signedInEmail ? "Change password" : "Reset password";

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {step !== "done" && (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/(auth)/sign-in"))}
              style={styles.backButton}
              accessibilityLabel="Go back"
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          )}

          <Text maxFontSizeMultiplier={1.5} style={styles.title} accessibilityRole="header">{title}</Text>

          {error && (
            <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {step === "email" && (
            <View style={styles.form}>
              <Text style={styles.subtitle}>
                We&apos;ll email you a code to set a new password.
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label} nativeID="email-label">Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#6B7280"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!loading && !signedInEmail}
                  accessibilityLabel="Email address"
                  accessibilityLabelledBy="email-label"
                />
              </View>
              <PrimaryButton label="Send code" loading={loading} onPress={sendCode} />
            </View>
          )}

          {step === "code" && (
            <View style={styles.form}>
              {info && (
                <Text style={styles.subtitle} accessibilityLiveRegion="polite">{info}</Text>
              )}
              {!verified && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Code from the email</Text>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
                    placeholder="12345678"
                    placeholderTextColor="#6B7280"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={10}
                    editable={!loading}
                    accessibilityLabel="Code from the email"
                  />
                </View>
              )}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>New password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!loading}
                  accessibilityLabel="New password"
                  accessibilityHint={PASSWORD_REQUIREMENTS_TEXT}
                />
                <Text style={styles.hint}>{PASSWORD_REQUIREMENTS_TEXT}</Text>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm new password</Text>
                <TextInput
                  style={styles.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!loading}
                  accessibilityLabel="Confirm new password"
                />
              </View>
              <PrimaryButton label="Save new password" loading={loading} onPress={savePassword} />
              {!verified && (
                <Pressable
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                  accessibilityRole="button"
                  style={styles.linkButton}
                >
                  <Text style={styles.link}>Didn&apos;t get it? Send a new code</Text>
                </Pressable>
              )}
            </View>
          )}

          {step === "done" && (
            <View style={styles.form} accessibilityLiveRegion="polite">
              <Text style={styles.subtitle}>Your password has been updated.</Text>
              <PrimaryButton label="Continue" loading={false} onPress={finish} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({ label, loading, onPress }: { label: string; loading: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.button, loading && styles.buttonDisabled]}
      onPress={onPress}
      disabled={loading}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" accessibilityLabel="Loading" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  backButton: { marginBottom: 24, alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  backText: { fontSize: 16, color: "#5B53EE", fontWeight: "500" },
  title: { fontSize: 28, fontWeight: "700", color: "#1A1A2E", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#4B5563" },
  errorBox: { backgroundColor: "#FEE2E2", borderRadius: 8, padding: 12, marginVertical: 12 },
  errorText: { color: "#991B1B", fontSize: 14 },
  form: { gap: 20, marginTop: 8 },
  inputGroup: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: "#1A1A2E" },
  hint: { fontSize: 12, color: "#4B5563" },
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
  codeInput: { fontSize: 22, letterSpacing: 6, textAlign: "center" },
  button: {
    backgroundColor: "#5B53EE",
    borderRadius: 12,
    paddingVertical: 16,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  linkButton: { alignSelf: "center", minHeight: 44, justifyContent: "center" },
  link: { fontSize: 15, color: "#5B53EE", fontWeight: "600" },
});
