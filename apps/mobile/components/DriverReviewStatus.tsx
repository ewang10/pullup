/**
 * Shown to drivers instead of the app until staff approve their account.
 *
 * - pending: explains the review and what staff are checking
 * - rejected: shows the reason staff gave and how to get help
 * - suspended: an admin paused an approved account; shows the reason and
 *   whether already-earned bonuses will still be paid
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RIDESHARE_PLATFORMS, type DriverProfile } from "@pullup/shared";
import { useAuth } from "../lib/auth";
import { fetchDriverPayouts, type PayoutAccount } from "../lib/api";
import { PayoutsCard } from "./PayoutsCard";

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

export default function DriverReviewStatus({ driverProfile }: { driverProfile: DriverProfile }) {
  const { refreshProfile, signOut, profile, session } = useAuth();
  const [checking, setChecking] = useState(false);
  const suspended = driverProfile.verification_status === "suspended";
  // Rejected and suspended drivers both see the reason and a support link.
  const rejected = driverProfile.verification_status === "rejected" || suspended;
  const unpaid = Number(driverProfile.payout_balance ?? 0);
  // Suspended drivers keep what they earned and can still cash it out (unless held).
  const [payouts, setPayouts] = useState<PayoutAccount | null>(null);
  const userId = session?.user.id;
  const loadPayouts = useCallback(async () => {
    if (!suspended || !userId) return;
    const { data } = await fetchDriverPayouts(userId);
    if (data) setPayouts(data);
  }, [suspended, userId]);
  useEffect(() => {
    loadPayouts();
  }, [loadPayouts]);
  const platform =
    RIDESHARE_PLATFORMS.find((p) => p.value === driverProfile.rideshare_platform)?.label ?? "Not provided";

  const checkAgain = async () => {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  };

  const contactSupport = () => {
    if (!SUPPORT_EMAIL) return;
    const subject = encodeURIComponent(rejected ? "Driver application review" : "Driver application question");
    const body = encodeURIComponent(`Account: ${profile?.email ?? ""}\n\n`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.badge, rejected ? styles.badgeRejected : styles.badgePending]}>
          <Text style={[styles.badgeText, rejected ? styles.badgeTextRejected : styles.badgeTextPending]}>
            {suspended ? "On hold" : rejected ? "Not approved" : "Under review"}
          </Text>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {suspended
            ? "Your driver account is on hold"
            : rejected
            ? "Your driver application wasn't approved"
            : "We're reviewing your driver account"}
        </Text>

        {rejected ? (
          <>
            <Text style={styles.text}>
              {suspended
                ? "Riders can't add your driver code to new claims while your account is on hold."
                : "Our team couldn't approve your account, so you can't earn driver bonuses yet."}
            </Text>
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Reason</Text>
              <Text style={styles.reasonText}>
                {driverProfile.verification_note ?? "No reason was given. Contact support for details."}
              </Text>
            </View>
            {suspended && payouts && !payouts.onHold && payouts.balance > 0 && (
              <PayoutsCard kind="driver" account={payouts} onChanged={loadPayouts} />
            )}
            {suspended && unpaid > 0 && (!payouts || payouts.onHold) && (
              <View style={[styles.reasonBox, driverProfile.payouts_on_hold ? null : styles.moneyBoxOk]}>
                <Text style={[styles.reasonLabel, driverProfile.payouts_on_hold ? null : styles.moneyLabelOk]}>
                  Your earned bonuses: ${unpaid.toFixed(2)}
                </Text>
                <Text style={styles.reasonText}>
                  {driverProfile.payouts_on_hold
                    ? "These are on hold while we review your account. Contact support if you have questions."
                    : "You earned these before the hold, so you'll still be paid."}
                </Text>
              </View>
            )}
            <Text style={styles.text}>
              {suspended
                ? "If you think this is a mistake, contact support and we'll take another look."
                : "If something was entered wrong, contact support with the correct details and we'll take another look."}
            </Text>
          </>
        ) : (
          <Text style={styles.text}>
            Before you can earn bonuses, our team checks that you actively drive for a rideshare company. This
            usually takes 1–2 business days. You&apos;ll get full access as soon as you&apos;re approved.
          </Text>
        )}

        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>What you sent us</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Platform</Text>
            <Text style={styles.detailValue}>{platform}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Driver ID</Text>
            <Text style={styles.detailValue}>{driverProfile.rideshare_driver_id ?? "Not provided"}</Text>
          </View>
        </View>

        {!rejected && (
          <Pressable
            style={[styles.primaryButton, checking && styles.disabled]}
            onPress={checkAgain}
            disabled={checking}
            accessibilityRole="button"
            accessibilityLabel="Check approval status again"
            accessibilityState={{ busy: checking }}
          >
            {checking ? (
              <ActivityIndicator color="#FFFFFF" accessibilityLabel="Checking" />
            ) : (
              <Text style={styles.primaryButtonText}>Check again</Text>
            )}
          </Pressable>
        )}

        {SUPPORT_EMAIL && (
          <Pressable
            style={rejected ? styles.primaryButton : styles.secondaryButton}
            onPress={contactSupport}
            accessibilityRole="button"
            accessibilityLabel="Email PullUp support"
          >
            <Text style={rejected ? styles.primaryButtonText : styles.secondaryButtonText}>Contact support</Text>
          </Pressable>
        )}

        <Pressable style={styles.linkButton} onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out">
          <Text style={styles.linkText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  content: { padding: 24, paddingTop: 48, gap: 16 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgePending: { backgroundColor: "#FEF3C7" },
  badgeRejected: { backgroundColor: "#FEE2E2" },
  badgeText: { fontSize: 13, fontWeight: "700" },
  badgeTextPending: { color: "#92400E" },
  badgeTextRejected: { color: "#991B1B" },
  title: { fontSize: 26, fontWeight: "700", color: "#1A1A2E" },
  text: { fontSize: 16, lineHeight: 23, color: "#374151" },
  reasonBox: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#FECACA", padding: 16, gap: 4 },
  reasonLabel: { fontSize: 13, fontWeight: "700", color: "#991B1B" },
  reasonText: { fontSize: 16, color: "#1A1A2E", lineHeight: 22 },
  moneyBoxOk: { borderColor: "#BBF7D0" },
  moneyLabelOk: { color: "#166534" },
  detailsCard: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, gap: 8 },
  detailsTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A2E" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  detailLabel: { fontSize: 15, color: "#4B5563" },
  detailValue: { fontSize: 15, fontWeight: "600", color: "#1A1A2E", flexShrink: 1, textAlign: "right" },
  primaryButton: { backgroundColor: "#5B53EE", borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  secondaryButton: { borderWidth: 1, borderColor: "#5B53EE", borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  secondaryButtonText: { color: "#5B53EE", fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.7 },
  linkButton: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  linkText: { color: "#4B5563", fontSize: 16, fontWeight: "500" },
});
