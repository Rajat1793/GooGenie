import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "../src/context/AuthContext";

export default function LoginScreen() {
  const [token, setToken] = useState("");
  const { setToken: storeToken } = useAuth();
  const router = useRouter();

  function submit() {
    const t = token.trim();
    if (!t) { Alert.alert("Token required", "Paste a bearer token to continue."); return; }
    storeToken(t);
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Googenie</Text>
      <Text style={styles.subtitle}>Paste your bearer token to sign in</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="Bearer token…"
        placeholderTextColor="#71787f"
        multiline
        numberOfLines={4}
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.button} onPress={submit}>
        <Text style={styles.buttonText}>Enter Workspace</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fd", alignItems: "center", justifyContent: "center", padding: 24 },
  logo: { fontSize: 40, fontWeight: "700", color: "#2b6389", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#71787f", marginBottom: 24, textAlign: "center" },
  input: {
    width: "100%", backgroundColor: "#edeef1", borderRadius: 12,
    padding: 14, fontFamily: "monospace", fontSize: 12, color: "#191c1e",
    marginBottom: 16, minHeight: 80, textAlignVertical: "top"
  },
  button: { backgroundColor: "#2b6389", borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40, width: "100%" },
  buttonText: { color: "#fff", fontWeight: "600", textAlign: "center", fontSize: 15 }
});
