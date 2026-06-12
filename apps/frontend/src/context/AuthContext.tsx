/**
 * Clerk-backed auth context.
 * Wraps @clerk/react so the rest of the app (Shell, HomePage, pages)
 * can keep using the same useAuth() interface.
 */
import { useUser, useAuth as useClerkAuth } from "@clerk/react";
import { createContext, useContext, type ReactNode } from "react";

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  role: "super_admin" | "manager_admin" | "user" | null;
  loading: boolean;
  token: string | null;
}

const AuthCtx = createContext<AuthState>({
  userId: null, tenantId: null, role: null, loading: true, token: null
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const { getToken } = useClerkAuth();

  // Map Clerk user to our auth shape
  // Role comes from Clerk public metadata (set in Clerk Dashboard or via API)
  const role = (user?.publicMetadata?.role as AuthState["role"]) ?? (user ? "user" : null);

  return (
    <AuthCtx.Provider value={{
      userId: user?.id ?? null,
      tenantId: (user?.publicMetadata?.tenantId as string) ?? "demo-tenant",
      role,
      loading: !isLoaded,
      token: null  // Clerk tokens fetched on-demand via getToken() in API calls
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}

// Export getToken helper for API client use
export { useClerkAuth };
