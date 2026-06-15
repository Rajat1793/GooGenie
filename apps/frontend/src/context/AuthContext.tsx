/**
 * Clerk-backed auth context — thin adapter over @clerk/react.
 * Exposes the user's real name, email, and image from Clerk.
 * Role is fetched from /v1/auth/me so it always reflects what's in the DB
 * (the login-page role selector flows through clerkSync → DB → here).
 */
import { useUser, useAuth as useClerkAuth } from "@clerk/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getDemoToken, authApi2 } from "../api/client.ts";
import { STORAGE_KEYS } from "../lib/storage.ts";
import type { Role } from "../lib/roles.ts";

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  role: Role | null;
  loading: boolean;
  token: string | null;
  // Clerk user profile
  fullName: string | null;
  email: string | null;
  imageUrl: string | null;
}

const AuthCtx = createContext<AuthState>({
  userId: null, tenantId: null, role: null, loading: true, token: null,
  fullName: null, email: null, imageUrl: null
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const { isSignedIn } = useClerkAuth();
  const [dbRole, setDbRole] = useState<AuthState["role"]>(null);
  const [dbTenantId, setDbTenantId] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  // If a demo token is active, decode the role from it
  const demoToken = getDemoToken();
  let demoRole: AuthState["role"] = null;
  let demoTenant = "dev";
  if (demoToken) {
    try {
      const [p] = demoToken.split(".");
      const payload = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
      demoRole = payload.role as AuthState["role"];
      demoTenant = payload.tenant_id ?? "dev";
    } catch { /* ignore */ }
  }

  // Listen for the clerkSync result broadcast by ClerkTokenWirer in App.tsx.
  // This fires AFTER clerkSync completes and gives us the authoritative role/tenant
  // from the DB — solving the race condition where /auth/me might return a stale
  // role from the previous session before clerkSync has updated the DB.
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

  // Fetch the authoritative role from DB after Clerk user is loaded.
  // This runs once per session after sign-in and whenever the user changes.
  // Note: if clerkSync hasn't run yet (first render), /auth/me may return the
  // previous session's role — that's OK because the event listener above will
  // correct it as soon as clerkSync completes.
  useEffect(() => {
    if (!isSignedIn || !isLoaded || demoToken) return;

    // Immediately apply any values already stored from a previous clerkSync in
    // this browser session so the UI renders correctly without any flicker.
    const storedRole = user?.id ? sessionStorage.getItem(STORAGE_KEYS.userRole(user.id)) : null;
    const storedTenant = user?.id ? sessionStorage.getItem(STORAGE_KEYS.userTenant(user.id)) : null;
    if (storedRole) setDbRole(storedRole as AuthState["role"]);
    if (storedTenant) setDbTenantId(storedTenant);

    setRoleLoading(true);
    authApi2.me()
      .then((res) => {
        setDbRole(res.user.role as AuthState["role"]);
        setDbTenantId(res.user.tenantId);
        // Persist so Shell/nav renders correctly on hot-reload
        if (user?.id) {
          sessionStorage.setItem(STORAGE_KEYS.userRole(user.id), res.user.role);
          sessionStorage.setItem(STORAGE_KEYS.userTenant(user.id), res.user.tenantId);
        }
      })
      .catch(() => {
        // /auth/me fails before clerkSync runs (first login, no DB row yet).
        // Fall back to the sessionStorage value or pending role from localStorage.
        const stored = user?.id ? sessionStorage.getItem(STORAGE_KEYS.userRole(user.id)) : null;
        const pending = localStorage.getItem(STORAGE_KEYS.pendingRole);
        if (!storedRole) setDbRole((stored ?? pending ?? "user") as AuthState["role"]);
      })
      .finally(() => setRoleLoading(false));
  }, [isSignedIn, isLoaded, user?.id, demoToken]);

  const role = demoRole ?? dbRole;
  // Also read tenantId from sessionStorage as a synchronous fallback so the
  // first render after a page reload shows the correct tenant immediately.
  const storedTenant = (!demoToken && user?.id)
    ? sessionStorage.getItem(STORAGE_KEYS.userTenant(user.id))
    : null;
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
      imageUrl: user?.imageUrl ?? null
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
