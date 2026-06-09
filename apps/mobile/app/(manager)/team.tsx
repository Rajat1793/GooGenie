/** S2-6 mobile — Manager team screen (placeholder) */
import { View, Text, StyleSheet } from "react-native";

export default function ManagerTeamScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Team</Text>
      <Text style={styles.sub}>Manager • Sprint S2-6 mobile coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fd", alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 28, fontWeight: "700", color: "#2b6389", marginBottom: 8 },
  sub: { fontSize: 13, color: "#71787f", textAlign: "center" }
});
