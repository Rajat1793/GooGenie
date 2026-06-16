import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const TOKEN_KEY = "googenie_token";

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

/**
 * Mobile API base URL (Phase 11 step 59).
 *
 * Migrated from Express backend (port 4000) → Next.js full-stack app on the
 * same Render service. Mobile paths historically include the `/v1/...` prefix,
 * so API_BASE points at `/api` and call sites stay unchanged.
 *
 * Override per-environment via `EXPO_PUBLIC_API_BASE` (Expo's runtime env).
 */
export const API_BASE =
  (process.env.EXPO_PUBLIC_API_BASE as string | undefined) ??
  "https://googenie-web.onrender.com/api";
