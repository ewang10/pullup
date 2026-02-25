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
import { useRouter } from "expo-router";
import { useAppStore } from "../../lib/store";
import { fetchMyClaims } from "../../lib/api";
import type { DealClaimWithDeal } from "@pullup/shared";

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
    reserved: { bg: "#ECFDF5", text: "#059669" },
    completed: { bg: "#F0EFFF", text: "#6C63FF" },
    expired: { bg: "#FEF2F2", text: "#DC2626" },
    cancelled: { bg: "#F3F4F6", text: "#6B7280" },
  };

  const colors = statusColors[claim.status] ?? statusColors.cancelled;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.statusText, { color: colors.text }]}>
            {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
          </Text>
        </View>
        {isReserved && (
          <Text style={styles.countdown}>{countdown}</Text>
        )}
      </View>

      <Text style={styles.dealTitle}>{claim.deal.title}</Text>
      <Text style={styles.venueName}>{claim.deal.venue.name}</Text>
      <Text style={styles.venueAddress} numberOfLines={1}>
        {claim.deal.venue.address}
      </Text>

      {isReserved && (
        <View style={styles.actionRow}>
          <Text style={styles.actionText}>Tap to redeem</Text>
        </View>
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

  useEffect(() => {
    loadClaims();
  }, []);

  const activeClaims = claims.filter((c) => c.status === "reserved");
  const pastClaims = claims.filter((c) => c.status !== "reserved");

  const renderEmpty = () => {
    if (claimsLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={styles.emptyTitle}>No claims yet</Text>
        <Text style={styles.emptySubtitle}>
          Browse deals and claim your first discount!
        </Text>
        <Pressable
          style={styles.browseButton}
          onPress={() => router.push("/(tabs)/deals")}
        >
          <Text style={styles.browseButtonText}>Browse Deals</Text>
        </Pressable>
      </View>
    );
  };

  if (!initialLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  const sections = [
    ...(activeClaims.length > 0
      ? [{ type: "header" as const, title: "Active Claims" }, ...activeClaims.map((c) => ({ type: "claim" as const, claim: c }))]
      : []),
    ...(pastClaims.length > 0
      ? [{ type: "header" as const, title: "Past Claims" }, ...pastClaims.map((c) => ({ type: "claim" as const, claim: c }))]
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
              tintColor="#6C63FF"
              colors={["#6C63FF"]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: "#F59E0B",
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
    color: "#6C63FF",
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
    color: "#6C63FF",
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
    fontSize: 48,
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
    backgroundColor: "#6C63FF",
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
