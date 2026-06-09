import { Redirect } from "expo-router";
import { useAuth } from "../src/context/AuthContext";

export default function Index() {
  const { role, loading } = useAuth();

  if (loading) return null;
  if (!role) return <Redirect href="/login" />;
  if (role === "super_admin") return <Redirect href="/(admin)/users" />;
  if (role === "manager_admin") return <Redirect href="/(manager)/team" />;
  return <Redirect href="/(tabs)/inbox" />;
}
