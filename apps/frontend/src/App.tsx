import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.tsx";
import { useAuth as useClerkAuthDirect, useUser as useClerkUser } from "@clerk/react";
import { useEffect, useState } from "react";
import { setClerkTokenGetter } from "./api/client.ts";
import { getDemoToken } from "./api/client.ts";
import { authApi2 } from "./api/client.ts";
import { prefetchUserData } from "./api/hooks.ts";
import { useLiveCacheStream } from "./hooks/useLiveCacheStream.ts";
import { ManagerSelectModal } from "./components/ManagerSelectModal.tsx";
import { Shell } from "./components/Shell.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { LandingPage } from "./pages/LandingPage.tsx";
import { AdminLayout } from "./pages/admin/AdminLayout.tsx";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage.tsx";
import { AdminActivityPage } from "./pages/admin/AdminActivityPage.tsx";
import { ManagerLayout } from "./pages/manager/ManagerLayout.tsx";
import { ManagerTeamPage } from "./pages/manager/ManagerTeamPage.tsx";
import { UserProfilePage } from "./pages/user/UserProfilePage.tsx";
import { InboxPage } from "./pages/InboxPage.tsx";
import { CalendarPage } from "./pages/CalendarPage.tsx";
import { OrgTreePage } from "./pages/OrgTreePage.tsx";
import { ApiDocsPage } from "./pages/ApiDocsPage.tsx";
import type { ReactNode } from "react";

/** Wires Clerk's getToken into the API client so all fetch calls carry the JWT */
function ClerkTokenWirer() {
  const { getToken, isSignedIn } = useClerkAuthDirect();
  const { user } = useClerkUser();
  const [needsManager, setNeedsManager] = useState(false);

  // Live cache invalidation via SSE: when the backend emits an event for this
  // user (e.g. Gmail webhook fired, or another tab mutated something) the
  // matching React Query keys are invalidated, triggering silent refetch.
  useLiveCacheStream();

  useEffect(() => {
    if (isSignedIn) {
      setClerkTokenGetter(async () => {
        const t = await getToken();
        return t;
      });
    }
  }, [getToken, isSignedIn]);

  // Sync Clerk user to DB after sign-in, applying the role chosen on the login page
  useEffect(() => {
    if (!isSignedIn || !user) return;
    const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
    const displayName = user.fullName ?? user.firstName ?? email.split("@")[0];
    // Read role chosen by the login tab (stored before Clerk redirected)
    const pendingRole = localStorage.getItem("googenie-pending-role") as "super_admin" | "manager_admin" | "user" | null;
    authApi2.clerkSync(email, displayName, pendingRole ?? undefined)
      .then((r) => {
        // Persist DB role so AuthContext can read it without re-fetching
        if (user?.id) sessionStorage.setItem(`googenie-role-${user.id}`, r.user.role);
        // Clear the pending role after it's been applied
        localStorage.removeItem("googenie-pending-role");
        if (r.needsManager) setNeedsManager(true);
        // Warm the React Query cache so the first /inbox or /calendar nav
        // is served from cache (0 ms) — silent background refetch keeps it fresh.
        prefetchUserData().catch(() => null);
      })
      .catch(() => {
        localStorage.removeItem("googenie-pending-role");
      });
  }, [isSignedIn, user?.id]);

  if (needsManager) return <ManagerSelectModal onComplete={() => setNeedsManager(false)} />;
  return null;
}

/** Auth guard — Clerk owns sign-in state, OR demo token bypasses it */
function RequireAuth({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useClerkAuthDirect();
  // If a demo token is set, skip Clerk entirely
  if (getDemoToken()) return <>{children}</>;
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
      </div>
    );
  }
  if (!isSignedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PlaceholderPage({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-on-surface-variant">
      <span className="material-symbols-outlined text-5xl">{icon}</span>
      <p className="font-headline text-2xl text-ink-text">{title}</p>
      <p className="text-sm">Coming in upcoming sprints.</p>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public landing page — no auth required */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Shell>
              <Routes>
                <Route index element={<Navigate to="inbox" replace />} />
                <Route path="admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="users" replace />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="activity" element={<AdminActivityPage />} />
                </Route>
                <Route path="manager" element={<ManagerLayout />}>
                  <Route index element={<Navigate to="team" replace />} />
                  <Route path="team" element={<ManagerTeamPage />} />
                </Route>
                <Route path="inbox" element={<InboxPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="org" element={<OrgTreePage />} />
                <Route path="api-docs" element={<ApiDocsPage />} />
                <Route path="profile" element={<UserProfilePage />} />
                <Route path="*" element={<Navigate to="inbox" replace />} />
              </Routes>
            </Shell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ClerkTokenWirer />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
