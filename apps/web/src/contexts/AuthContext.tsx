"use client";

/**
 * Next.js port of apps/frontend/src/context/AuthContext.tsx
 *
 * Identical public API (`useAuth()`) so existing ported components keep
 * working without changes. Backed by @clerk/nextjs + /api/v1/auth/me.
 *
 * Demo-token path: still sessionStorage (matches mobile's AsyncStorage).
 */
import { useUser, useAuth as useClerkAuth } from "@clerk/nextjs";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getDemoToken, authApi2 } from "../api/client";
import { STORAGE_KEYS } from "../lib/storage";
import type { Role } from "../lib/roles";

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  role: Role | null;
  loading: boolean;
  token: string | null;
  fullName: string | null;
  email: string | null;
  imageUrl: string | null;
}

const AuthCtx = createContext<AuthState>({
  userId: null, tenantId: null, role: null, loading: true, token: null,
  fullName: null, email: null, imageUrl: null,
});

function safeSessionGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(key);
}

function safeSessionSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(key, value);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const { isSignedIn } = useClerkAuth();
  const [dbRole, setDbRole] = useState<AuthState["role"]>(null);
  const [dbTenantId, setDbTenantId] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  const demoToken = typeof window !== "undefined" ? getDemoToken() : null;
  let demoRole: AuthState["role"] = null;
  let demoTenant = "dev";
  if (demoToken) {
    try {
      const [p] = demoToken.split(".");
      const payload = JSON.parse(atob((p ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      demoRole = payload.role as AuthState["role"];
      demoTenant = payload.tenant_id ?? "dev";
    } catch { /* ignore */ }
  }

  useEffect(() => {
    function onRoleSynced(e: Event) {
      const { role, tenantId } = (e as CustomEvent<{ role: string; tenantId: string }>).detail;
      setDbRole(role as AuthState["role"]);
      setDbTenantId(tenantId);
      setRoleLoading(false);
    }
    window.addEventListener("googenie:role-synced", onRoleSynced);
    return () => window.removeEventListener("googenie:role-synced", onRoleSynced);
  }, []);

  useEffect(() => {
    if (!isSignedIn || !isLoaded || demoToken) return;

    const storedRole = user?.id ? safeSessionGet(STORAGE_KEYS.userRole(user.id)) : null;
    const storedTenant = user?.id ? safeSessionGet(STORAGE_KEYS.userTenant(user.id)) : null;
    if (storedRole) setDbRole(storedRole as AuthState["role"]);
    if (storedTenant) setDbTenantId(storedTenant);

    setRoleLoading(true);
    authApi2.me()
      .then((res) => {
        setDbRole(res.user.role as AuthState["role"]);
        setDbTenantId(res.user.tenantId);
        if (user?.id) {
          safeSessionSet(STORAGE_KEYS.userRole(user.id), res.user.role);
          safeSessionSet(STORAGE_KEYS.userTenant(user.id), res.user.tenantId);
        }
      })
      .catch(() => {
        const stored = user?.id ? safeSessionGet(STORAGE_KEYS.userRole(user.id)) : null;
        const pending = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEYS.pendingRole) : null;
        if (!storedRole) setDbRole((stored ?? pending ?? "user") as AuthState["role"]);
      })
      .finally(() => setRoleLoading(false));
  }, [isSignedIn, isLoaded, user?.id, demoToken]);

  const role = demoRole ?? dbRole;
  const storedTenant = (!demoToken && user?.id) ? safeSessionGet(STORAGE_KEYS.userTenant(user.id)) : null;
  const tenantId = demoToken
    ? demoTenant
    : (dbTenantId ?? storedTenant ?? (user?.publicMetadata?.tenantId as string) ?? "dev");

  return (
    <AuthCtx.Provider value={{
      userId: user?.id ?? (demoToken ? "demo-user" : null),
      tenantId,
      role,
      loading: (!isLoaded && !demoToken) || roleLoading,
      token: null,
      fullName: user?.fullName ?? user?.firstName ?? null,
      email: user?.primaryEmailAddress?.emailAddress ?? null,
      imageUrl: user?.imageUrl ?? null,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
