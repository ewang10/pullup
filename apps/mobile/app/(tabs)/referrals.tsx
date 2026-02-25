import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Share,
} from "react-native";
import { useAuth } from "../../lib/auth";
import { fetchDriverReferrals } from "../../lib/api";

interface Referral {
  id: string;
  rider_name: string;
  rider_email: string;
  total_claims: number;
  joined_at: string;
}

export default function ReferralsScreen() {
  const { profile } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchDriverReferrals();
    if (err) {
      setError(err);
    } else if (data) {
      setReferrals(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadReferrals();
  }, []);

  const handleShare = async () => {
    if (!profile?.referral_code) return;

    try {
      await Share.share({
        message: `Join PullUp and get exclusive local deals! Use my referral code: ${profile.referral_code}\n\nDownload: https://pullup.app/download`,
      });
    } catch {
      // User cancelled share
    }
  };

  if (loading && referrals.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Your Referral Code</Text>
        <Text style={styles.codeValue}>
          {profile?.referral_code ?? "---"}
        </Text>
        <Text style={styles.codeHint}>
          Share this code with riders to earn commissions on their claims.
        </Text>
        <Pressable style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>Share Code</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>
        Referred Riders ({referrals.length})
      </Text>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={referrals}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.referralCard}>
            <View style={styles.referralAvatar}>
              <Text style={styles.referralAvatarText}>
                {item.rider_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </Text>
            </View>
            <View style={styles.referralInfo}>
              <Text style={styles.referralName}>{item.rider_name}</Text>
              <Text style={styles.referralJoined}>
                Joined {new Date(item.joined_at).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.claimsBadge}>
              <Text style={styles.claimsCount}>{item.total_claims}</Text>
              <Text style={styles.claimsLabel}>claims</Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadReferrals}
            tintColor="#6C63FF"
            colors={["#6C63FF"]}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔗</Text>
              <Text style={styles.emptyTitle}>No referrals yet</Text>
              <Text style={styles.emptySubtitle}>
                Share your code to start earning!
              </Text>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
  codeCard: {
    backgroundColor: "#6C63FF",
    margin: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  codeLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  codeValue: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 3,
    marginBottom: 8,
  },
  codeHint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  shareButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  shareButtonText: {
    color: "#6C63FF",
    fontSize: 15,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A2E",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  referralCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  referralAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F0EFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  referralAvatarText: {
    color: "#6C63FF",
    fontWeight: "700",
    fontSize: 16,
  },
  referralInfo: {
    flex: 1,
  },
  referralName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  referralJoined: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  claimsBadge: {
    alignItems: "center",
  },
  claimsCount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6C63FF",
  },
  claimsLabel: {
    fontSize: 11,
    color: "#6B7280",
  },
  separator: {
    height: 8,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
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
  },
});
