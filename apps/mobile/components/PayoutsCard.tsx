/**
 * Balance, payout setup and cash out, shared by driver earnings, the rider
 * wallet and suspended drivers (who can still withdraw what they earned).
 *
 * Payout setup opens Stripe's hosted onboarding in the browser, so identity
 * and bank details are entered on Stripe, never in PullUp. When the user comes
 * back to the app we refresh to pick up the new status.
 */
import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Linking, AppState } from "react-native";
import { cashOut, getPayoutLink, type PayoutAccount, type PayoutKind } from "../lib/api";

const money = (n: number) => `$${n.toFixed(2)}`;

export function PayoutsCard({
  kind,
  account,
  onChanged,
}: {
  kind: PayoutKind;
  account: PayoutAccount;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"link" | "cashout" | null>(null);
  const openedStripe = useRef(false);

  // Refresh after returning from Stripe onboarding.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && openedStripe.current) {
        openedStripe.current = false;
        onChanged();
      }
    });
    return () => sub.remove();
  }, [onChanged]);

  const openStripe = async () => {
    setBusy("link");
    const { data, error } = await getPayoutLink(kind);
    setBusy(null);
    if (error || !data) {
      Alert.alert("Couldn't open Stripe", error ?? "Try again.");
      return;
    }
    openedStripe.current = true;
    await Linking.openURL(data.url);
  };

  const confirmCashOut = () => {
    Alert.alert(
      "Cash out?",
      `Send ${money(account.balance)} to your bank account? It usually arrives in 2–3 business days.`,
      [
        { text: "Not now", style: "cancel" },
        {
          text: `Send ${money(account.balance)}`,
          onPress: async () => {
            setBusy("cashout");
            const { data, error } = await cashOut(kind);
            setBusy(null);
            if (error) {
              Alert.alert("Cash out failed", error);
              return;
            }
            Alert.alert("On its way", `${money(data?.amount ?? account.balance)} is being sent to your bank.`);
            onChanged();
          },
        },
      ]
    );
  };

  const canCashOut = account.onboardingComplete && !account.onHold && account.balance > 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{kind === "driver" ? "Available to cash out" : "Ride credit balance"}</Text>
      <Text style={styles.balance} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.6} accessibilityLabel={`${money(account.balance)} available`}>
        {money(account.balance)}
      </Text>

      {account.onHold ? (
        <Text style={styles.holdText} accessibilityRole="alert">
          Payouts are on hold while we review your account. Contact support if you have questions.
        </Text>
      ) : !account.onboardingComplete ? (
        <>
          <Text style={styles.help}>
            Set up payouts with Stripe to send your {kind === "driver" ? "bonuses" : "ride credit"} to your bank. You&apos;ll
            enter your details on Stripe&apos;s secure site, then come back here.
          </Text>
          <PrimaryButton label="Set up payouts" busy={busy === "link"} onPress={openStripe} />
        </>
      ) : (
        <>
          <PrimaryButton
            label={account.balance > 0 ? `Cash out ${money(account.balance)}` : "Nothing to cash out yet"}
            busy={busy === "cashout"}
            disabled={!canCashOut}
            onPress={confirmCashOut}
          />
          <Pressable
            onPress={openStripe}
            disabled={busy !== null}
            style={styles.linkButton}
            accessibilityRole="button"
            accessibilityLabel="Manage payout account on Stripe"
          >
            <Text style={styles.linkText}>Manage payout account</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const HISTORY_PREVIEW = 5;

export function PayoutHistory({ account, emptyText }: { account: PayoutAccount; emptyText: string }) {
  const [showAll, setShowAll] = useState(false);
  const total = Math.min(account.history.length, 30);
  const rows = account.history.slice(0, showAll ? 30 : HISTORY_PREVIEW);
  return (
    <View style={styles.historyCard}>
      <Text style={styles.historyTitle} accessibilityRole="header">
        History
      </Text>
      {account.history.length === 0 ? (
        <Text style={styles.help}>{emptyText}</Text>
      ) : (
        rows.map((h) => {
          const date = new Date(h.at).toLocaleDateString([], { month: "short", day: "numeric" });
          const sign = h.kind === "cashout" ? "−" : "+";
          return (
            <View
              key={`${h.kind}-${h.id}`}
              style={styles.row}
              accessible
              accessibilityLabel={`${h.label}, ${h.kind === "cashout" ? "minus" : "plus"} ${money(h.amount)}${h.pending ? ", pending" : ""}, ${h.status}, ${date}`}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{h.label}</Text>
                <Text style={styles.rowMeta}>
                  {date} · {h.status}
                </Text>
              </View>
              <Text style={[styles.rowAmount, h.pending ? styles.rowPending : h.kind === "cashout" ? styles.rowOut : styles.rowIn]}>
                {sign}
                {money(h.amount)}
              </Text>
            </View>
          );
        })
      )}
      {total > HISTORY_PREVIEW && (
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          style={styles.linkButton}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAll }}
        >
          <Text style={styles.linkText}>{showAll ? "Show less" : `Show all ${total}`}</Text>
        </Pressable>
      )}
    </View>
  );
}

function PrimaryButton({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.button, (busy || disabled) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled, busy }}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" accessibilityLabel="Working" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 20, gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: "#4B5563" },
  balance: { fontSize: 34, fontWeight: "800", color: "#1A1A2E" },
  help: { fontSize: 14, lineHeight: 20, color: "#374151" },
  holdText: { fontSize: 14, lineHeight: 20, color: "#991B1B" },
  button: {
    marginTop: 8,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#5B53EE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonDisabled: { backgroundColor: "#6B7280" },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600", textAlign: "center" },
  linkButton: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  linkText: { color: "#5B53EE", fontSize: 15, fontWeight: "600" },
  historyCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 20, gap: 4 },
  historyTitle: { fontSize: 16, fontWeight: "700", color: "#1A1A2E", marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, color: "#1A1A2E" },
  rowMeta: { fontSize: 13, color: "#4B5563", marginTop: 2 },
  rowAmount: { fontSize: 16, fontWeight: "700" },
  rowIn: { color: "#047857" },
  rowOut: { color: "#1A1A2E" },
  rowPending: { color: "#6B7280", fontWeight: "600" },
});
