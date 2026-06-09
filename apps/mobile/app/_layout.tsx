import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/context/AuthContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#f8f9fd" },
            headerTintColor: "#2b6389",
            headerTitleStyle: { fontFamily: "serif", fontWeight: "600" }
          }}
        />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
