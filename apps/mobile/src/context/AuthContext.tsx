import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const TOKEN_KEY = "nimbus_token";

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  role: "super_admin" | "manager_admin" | "user" | null;
  loading: boolean;
  token: string | null;
  setToken: (t: string) => void;
  logout: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<AuthState["role"]>(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate token on mount
  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY).then((stored) => {
      if (stored) {
        setTokenState(stored);
        fetchProfile(stored);
      } else {
        setLoading(false);
      }
    });
  }, []);

  async function fetchProfile(t: string) {
    try {
      const res = await fetch(`${API_BASE}/v1/me/profile`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (!res.ok) throw new Error("Unauthorized");
      const p = await res.json();
      setUserId(p.id);
      setTenantId(p.tenant_id);
      setRole(p.role);
    } catch {
      await AsyncStorage.removeItem(TOKEN_KEY);
      setTokenState(null);
    } finally {
      setLoading(false);
    }
  }

  function setToken(t: string) {
    AsyncStorage.setItem(TOKEN_KEY, t);
    setTokenState(t);
    fetchProfile(t);
  }

  function logout() {
    AsyncStorage.removeItem(TOKEN_KEY);
    setTokenState(null);
    setUserId(null);
    setTenantId(null);
    setRole(null);
  }

  return (
    <AuthCtx.Provider value={{ userId, tenantId, role, loading, token, setToken, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

/** Override with your dev machine IP when testing on a physical device */
export const API_BASE = "http://localhost:4000";
