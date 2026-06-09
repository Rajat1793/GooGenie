import { View, Text, StyleSheet } from "react-native";

interface Props {
  role: string;
}

const LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  manager_admin: "Manager",
  user: "User"
};

const COLORS: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: "#ffdad6", text: "#93000a" },
  manager_admin: { bg: "#ecae6a55", text: "#6c4003" },
  user: { bg: "#c6e4f7", text: "#4a6677" }
};

export function RoleBadge({ role }: Props) {
  const c = COLORS[role] ?? { bg: "#edeef1", text: "#41474e" };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>{LABELS[role] ?? role}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  text: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 }
});
