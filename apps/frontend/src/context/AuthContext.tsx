import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { authApi } from "../api/client.ts";

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
  const [token, setTokenState] = useState<string | null>(
    () => sessionStorage.getItem("googenie_token")
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<AuthState["role"]>(null);
  const [loading, setLoading] = useState(Boolean(sessionStorage.getItem("googenie_token")));

  const fetchProfile = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const p = await authApi.getProfile();
      setUserId(p.id);
      setTenantId(p.tenant_id);
      setRole(p.role as AuthState["role"]);
    } catch {
      // token invalid — clear everything
      sessionStorage.removeItem("googenie_token");
      setTokenState(null);
      setUserId(null);
      setTenantId(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch on initial mount if token already in sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("googenie_token");
    if (stored) {
      fetchProfile(stored);
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setToken(t: string) {
    sessionStorage.setItem("googenie_token", t);
    setTokenState(t);
    // Always fetch profile when a new token is explicitly set
    fetchProfile(t);
  }

  function logout() {
    sessionStorage.removeItem("googenie_token");
    setTokenState(null);
    setUserId(null);
    setTenantId(null);
    setRole(null);
    setLoading(false);
  }

  return (
    <AuthCtx.Provider value={{ userId, tenantId, role, loading, token, setToken, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
