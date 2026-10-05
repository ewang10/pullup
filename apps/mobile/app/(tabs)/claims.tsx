import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppStore } from "../../lib/store";
import { fetchMyClaims } from "../../lib/api";
import { receiptDeadline, type DealClaimWithDeal } from "@pullup/shared";

function useCountdown(expiresAt: string) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m remaining`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s remaining`);
      } else {
        setTimeLeft(`${seconds}s remaining`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return timeLeft;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

/**
 * One line telling the rider where a visit stands, and whether they need to
 * do something (upload or re-upload a receipt).
 */
function visitStatus(claim: DealClaimWithDeal): { text: string; tone: "action" | "warn" | "good" | "muted"; needsAction: boolean } {
  if (claim.status === "expired") return { text: "Expired before check-in", tone: "muted", needsAction: false };
  if (claim.status === "cancelled") return { text: "You cancelled this claim", tone: "muted", needsAction: false };
  if (claim.status !== "completed") return { text: "", tone: "muted", needsAction: false };

  const required = [
    ...(claim.deal.requires_ride_receipt ? [{ url: claim.ride_receipt_url, status: claim.ride_receipt_status }] : []),
    ...(claim.deal.requires_venue_receipt ? [{ url: claim.venue_receipt_url, status: claim.venue_receipt_status }] : []),
  ];
  const credit = `$${Number(claim.deal.ride_credit_amount).toFixed(2)}`;
  if (claim.unverified_at) return { text: "Closed: receipt wasn't uploaded in time", tone: "muted", needsAction: false };
  if (required.some((r) => r.status === "rejected"))
    return { text: "Receipt not approved. Upload a new one", tone: "warn", needsAction: true };
  if (required.some((r) => !r.url))
    return {
      text: claim.completed_at
        ? `Upload your receipt by ${shortDate(receiptDeadline(claim.completed_at, claim.receipt_due_at).toISOString())}`
        : "Upload your receipt",
      tone: "action",
      needsAction: true,
    };
  if (claim.ride_credit_paid) return { text: `${credit} ride credit added`, tone: "good", needsAction: false };
  if (required.length > 0) return { text: "Receipt in review", tone: "muted", needsAction: false };
  return { text: "Checked in", tone: "good", needsAction: false };
}

const TONE_COLOR = { action: "#B45309", warn: "#B91C1C", good: "#047857", muted: "#4B5563" } as const;
const STATUS_LABEL: Record<string, string> = {
  reserved: "Reserved",
  completed: "Visited",
  expired: "Expired",
  cancelled: "Cancelled",
};

function ClaimCard({
  claim,
  onPress,
}: {
  claim: DealClaimWithDeal;
  onPress: () => void;
}) {
  const countdown = useCountdown(claim.expires_at);
  const isReserved = claim.status === "reserved";

  const statusColors: Record<string, { bg: string; text: string }> = {
    reserved: { bg: "#ECFDF5", text: "#047857" },
    completed: { bg: "#F0EFFF", text: "#5B53EE" },
    expired: { bg: "#FEF2F2", text: "#B91C1C" },
    cancelled: { bg: "#F3F4F6", text: "#6B7280" },
  };

  const colors = statusColors[claim.status] ?? statusColors.cancelled;
  const status = visitStatus(claim);
  const label = STATUS_LABEL[claim.status] ?? claim.status;

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${claim.deal.title} at ${claim.deal.venue.name}, ${label}, ${
        isReserved ? countdown : `${shortDate(claim.reserved_at)}. ${status.text}`
      }`}
      accessibilityHint={isReserved ? "Opens the claim to check in" : "Opens the claim details"}
    >
      <View style={styles.cardTop}>
        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.statusText, { color: colors.text }]}>
            {label}
          </Text>
        </View>
        {isReserved ? (
          <Text style={styles.countdown}>{countdown}</Text>
        ) : (
          <Text style={styles.dateText}>{shortDate(claim.reserved_at)}</Text>
        )}
      </View>

      <Text style={styles.dealTitle}>{claim.deal.title}</Text>
      <Text style={styles.venueName}>{claim.deal.venue.name}</Text>
      <Text style={styles.venueAddress} numberOfLines={1}>
        {claim.deal.venue.address}
      </Text>

      {isReserved && (
        <View style={styles.actionRow}>
          <Text style={styles.actionText}>Tap to check in</Text>
        </View>
      )}
      {!isReserved && status.text !== "" && (
        <Text style={[styles.visitStatus, { color: TONE_COLOR[status.tone] }, status.needsAction && styles.visitStatusAction]}>
          {status.text}
        </Text>
      )}
    </Pressable>
  );
}

export default function ClaimsScreen() {
  const router = useRouter();
  const { claims, setClaims, claimsLoading, setClaimsLoading, setClaimsError } =
    useAppStore();
  const [initialLoaded, setInitialLoaded] = useState(false);

  const loadClaims = useCallback(async () => {
    setClaimsLoading(true);
    setClaimsError(null);

    const { data, error } = await fetchMyClaims();
    if (error) {
      setClaimsError(error);
    } else if (data) {
      setClaims(data);
    }

    setClaimsLoading(false);
    setInitialLoaded(true);
  }, []);

  // Reload whenever the tab is shown, so a claim made elsewhere appears.
  useFocusEffect(
    useCallback(() => {
      loadClaims();
    }, [loadClaims])
  );

  const activeClaims = claims.filter((c) => c.status === "reserved");
  const needsReceipt = claims.filter((c) => c.status !== "reserved" && visitStatus(c).needsAction);
  const pastClaims = claims.filter((c) => c.status !== "reserved" && !visitStatus(c).needsAction);

  const renderEmpty = () => {
    if (claimsLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="receipt-outline" size={44} color="#9CA3AF" style={styles.emptyIcon} accessible={false} />
        <Text style={styles.emptyTitle}>No claims yet</Text>
        <Text style={styles.emptySubtitle}>
          Browse deals and claim your first discount!
        </Text>
        <Pressable
          style={styles.browseButton}
          onPress={() => router.push("/(tabs)/deals")}
          accessibilityRole="button"
        >
          <Text style={styles.browseButtonText}>Browse deals</Text>
        </Pressable>
      </View>
    );
  };

  if (!initialLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#5B53EE" accessibilityLabel="Loading claims" />
      </View>
    );
  }

  const sections = [
    ...(activeClaims.length > 0
      ? [{ type: "header" as const, title: "Active claims" }, ...activeClaims.map((c) => ({ type: "claim" as const, claim: c }))]
      : []),
    ...(needsReceipt.length > 0
      ? [{ type: "header" as const, title: "Needs a receipt" }, ...needsReceipt.map((c) => ({ type: "claim" as const, claim: c }))]
      : []),
    ...(pastClaims.length > 0
      ? [{ type: "header" as const, title: "Past claims" }, ...pastClaims.map((c) => ({ type: "claim" as const, claim: c }))]
      : []),
  ];

  return (
    <View style={styles.container}>
      {claims.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item, index) =>
            item.type === "header" ? `header-${index}` : (item as any).claim.id
          }
          renderItem={({ item }) => {
            if (item.type === "header") {
              return (
                <Text style={styles.sectionHeader}>{item.title}</Text>
              );
            }
            return (
              <ClaimCard
                claim={(item as any).claim}
                onPress={() =>
                  router.push(`/claim/${(item as any).claim.id}`)
                }
              />
            );
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={claimsLoading}
              onRefresh={loadClaims}
              tintColor="#5B53EE"
              colors={["#5B53EE"]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dateText: {
    fontSize: 13,
    color: "#4B5563",
  },
  visitStatus: {
    fontSize: 14,
    marginTop: 8,
  },
  visitStatusAction: {
    fontWeight: "600",
  },
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A2E",
    marginTop: 8,
    marginBottom: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  countdown: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B45309",
  },
  dealTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1A1A2E",
    marginBottom: 4,
  },
  venueName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#5B53EE",
    marginBottom: 2,
  },
  venueAddress: {
    fontSize: 13,
    color: "#6B7280",
  },
  actionRow: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
  actionText: {
    color: "#5B53EE",
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },
  separator: {
    height: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 8,
  },
  emptyIcon: {
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  browseButton: {
    marginTop: 16,
    backgroundColor: "#5B53EE",
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  browseButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
});
