import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

export default function ManagerLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2b6389",
        tabBarInactiveTintColor: "#71787f",
        tabBarStyle: { backgroundColor: "#f8f9fd", borderTopColor: "#c1c7cf33" },
        headerStyle: { backgroundColor: "#f8f9fd" },
        headerTintColor: "#2b6389"
      }}
    >
      <Tabs.Screen
        name="team"
        options={{
          title: "My Team",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="group" size={size} color={color} />
        }}
      />
    </Tabs>
  );
}
