import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

export default function TabLayout() {
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
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="inbox" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="calendar-month" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="account-circle" size={size} color={color} />
        }}
      />
    </Tabs>
  );
}
