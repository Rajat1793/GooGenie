/**
 * Clerk-backed auth context — thin adapter over @clerk/react.
 * Exposes the user's real name, email, and image from Clerk.
 */
import { useUser } from "@clerk/react";
import { createContext, useContext, type ReactNode } from "react";
import { getDemoToken } from "../api/client.ts";

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  role: "super_admin" | "manager_admin" | "user" | null;
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

  // If a demo token is active, decode the role from it
  const demoToken = getDemoToken();
  let demoRole: AuthState["role"] = null;
  if (demoToken) {
    try {
      const [p] = demoToken.split(".");
      const payload = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
      demoRole = payload.role as AuthState["role"];
    } catch { /* ignore */ }
  }

  // For Clerk users: role comes from DB (set by the login tab via clerkSync).
  // We store it in sessionStorage after clerkSync resolves so AuthContext can read it.
  // Fall back to "user" if not set yet.
  let dbRole: AuthState["role"] = null;
  if (user && !demoRole) {
    const stored = sessionStorage.getItem(`googenie-role-${user.id}`);
    dbRole = (stored as AuthState["role"]) ?? "user";
  }

  const role = demoRole ?? dbRole;

  return (
    <AuthCtx.Provider value={{
      userId: user?.id ?? "demo-user",
      tenantId: (user?.publicMetadata?.tenantId as string) ?? "dev",
      role,
      loading: !isLoaded && !demoToken,
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
