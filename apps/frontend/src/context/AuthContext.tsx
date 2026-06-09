import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
    () => sessionStorage.getItem("nimbus_token")
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<AuthState["role"]>(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    authApi
      .getProfile()
      .then((p) => {
        setUserId(p.id);
        setTenantId(p.tenant_id);
        setRole(p.role as AuthState["role"]);
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function setToken(t: string) {
    sessionStorage.setItem("nimbus_token", t);
    setTokenState(t);
  }

  function logout() {
    sessionStorage.removeItem("nimbus_token");
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
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
