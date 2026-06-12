/**
 * Clerk-backed auth context — thin adapter over @clerk/react.
 * Exposes the user's real name, email, and image from Clerk.
 */
import { useUser } from "@clerk/react";
import { createContext, useContext, type ReactNode } from "react";

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

  const role = (user?.publicMetadata?.role as AuthState["role"]) ?? (user ? "user" : null);

  return (
    <AuthCtx.Provider value={{
      userId: user?.id ?? null,
      tenantId: (user?.publicMetadata?.tenantId as string) ?? "demo-tenant",
      role,
      loading: !isLoaded,
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
