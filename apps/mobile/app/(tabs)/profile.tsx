import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useAuth } from "../../src/context/AuthContext";
import { meApi, type FeatureToggle, type AuditEvent } from "../../src/api/client";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  manager_admin: "Manager",
  user: "User"
};

function FeatureRow({ toggle }: { toggle: FeatureToggle }) {
  return (
    <View style={[styles.featureRow, toggle.isEnabled ? styles.featureOn : styles.featureOff]}>
      <Text style={[styles.featureLabel, !toggle.isEnabled && { color: "#71787f" }]}>
        {toggle.featureKey.replace(/_/g, " ")}
      </Text>
      <View style={[styles.dot, { backgroundColor: toggle.isEnabled ? "#2b6389" : "#c1c7cf" }]} />
    </View>
  );
}

function ActivityRow({ event }: { event: AuditEvent }) {
  return (
    <View style={styles.activityRow}>
      <View style={styles.activityDot} />
      <View style={{ flex: 1 }}>
        <Text style={styles.activityAction}>{event.action.replace(/_/g, " ")}</Text>
        <Text style={styles.activityMeta}>{event.method} {event.route}</Text>
      </View>
      <Text style={styles.activityTime}>{new Date(event.at).toLocaleTimeString()}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { userId, tenantId, role } = useAuth();
  const [features, setFeatures] = useState<FeatureToggle[]>([]);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [loadingF, setLoadingF] = useState(true);
  const [loadingA, setLoadingA] = useState(true);

  useEffect(() => {
    meApi.getFeatures()
      .then((r) => setFeatures(r.features))
      .catch(console.error)
      .finally(() => setLoadingF(false));

    meApi.getActivity()
      .then((r) => setActivity(r.activity.slice().reverse()))
      .catch(console.error)
      .finally(() => setLoadingA(false));
  }, []);

  const enabledCount = features.filter((f) => f.isEnabled).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Identity card */}
      <View style={styles.identityCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(userId ?? "?").charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userId}>{userId}</Text>
          <Text style={styles.tenantId}>Tenant: {tenantId}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{ROLE_LABELS[role ?? "user"] ?? role}</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.featureCount}>{enabledCount}</Text>
          <Text style={styles.featureCountLabel}>features on</Text>
        </View>
      </View>

      {/* Features */}
      <Text style={styles.sectionTitle}>My Feature Access</Text>
      {loadingF ? (
        <ActivityIndicator color="#2b6389" style={{ marginVertical: 16 }} />
      ) : features.length === 0 ? (
        <Text style={styles.emptyText}>No feature toggles assigned yet.</Text>
      ) : (
        features.map((f) => <FeatureRow key={f.featureKey} toggle={f} />)
      )}

      {/* Activity */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>My Recent Activity</Text>
      {loadingA ? (
        <ActivityIndicator color="#2b6389" style={{ marginVertical: 16 }} />
      ) : activity.length === 0 ? (
        <Text style={styles.emptyText}>No activity recorded yet.</Text>
      ) : (
        activity.map((ev, i) => <ActivityRow key={i} event={ev} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fd" },
  content: { padding: 20, paddingBottom: 40 },
  identityCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 16,
    padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: "rgba(193,199,207,0.3)"
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#8cc0eb", alignItems: "center", justifyContent: "center"
  },
  avatarText: { fontSize: 22, fontWeight: "700", color: "#0d4f74" },
  userId: { fontSize: 16, fontWeight: "600", color: "#2D3436" },
  tenantId: { fontSize: 12, color: "#71787f", marginTop: 2 },
  roleBadge: {
    marginTop: 6, alignSelf: "flex-start",
    backgroundColor: "#c6e4f7", borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 2
  },
  roleBadgeText: { fontSize: 10, fontWeight: "600", color: "#4a6677", textTransform: "uppercase" },
  featureCount: { fontSize: 28, fontWeight: "700", color: "#2b6389" },
  featureCountLabel: { fontSize: 10, color: "#71787f", textTransform: "uppercase" },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#71787f", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  featureRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderRadius: 12, marginBottom: 8,
    borderWidth: 1
  },
  featureOn: { backgroundColor: "rgba(43,99,137,0.05)", borderColor: "rgba(43,99,137,0.2)" },
  featureOff: { backgroundColor: "#f3f3f7", borderColor: "rgba(193,199,207,0.2)" },
  featureLabel: { fontSize: 14, fontWeight: "500", color: "#2D3436", textTransform: "capitalize" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  activityRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(193,199,207,0.2)"
  },
  activityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#2b6389", marginTop: 6 },
  activityAction: { fontSize: 13, fontWeight: "500", color: "#2D3436", textTransform: "capitalize", flex: 1 },
  activityMeta: { fontSize: 11, color: "#71787f", marginTop: 2 },
  activityTime: { fontSize: 11, color: "#71787f" },
  emptyText: { fontSize: 13, color: "#71787f", textAlign: "center", marginVertical: 16 }
});
