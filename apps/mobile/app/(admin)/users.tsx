/** S2-5 mobile — Super Admin users screen (placeholder, implement in upcoming sprint) */
import { View, Text, StyleSheet } from "react-native";

export default function AdminUsersScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Users</Text>
      <Text style={styles.sub}>Super Admin • Sprint S2-5 mobile coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fd", alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 28, fontWeight: "700", color: "#2b6389", marginBottom: 8 },
  sub: { fontSize: 13, color: "#71787f", textAlign: "center" }
});
