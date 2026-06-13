import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.tsx";
import { useAuth as useClerkAuthDirect } from "@clerk/react";
import { useEffect } from "react";
import { setClerkTokenGetter } from "./api/client.ts";
import { Shell } from "./components/Shell.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { AdminLayout } from "./pages/admin/AdminLayout.tsx";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage.tsx";
import { AdminActivityPage } from "./pages/admin/AdminActivityPage.tsx";
import { ManagerLayout } from "./pages/manager/ManagerLayout.tsx";
import { ManagerTeamPage } from "./pages/manager/ManagerTeamPage.tsx";
import { UserProfilePage } from "./pages/user/UserProfilePage.tsx";
import { InboxPage } from "./pages/InboxPage.tsx";
import { CalendarPage } from "./pages/CalendarPage.tsx";
import type { ReactNode } from "react";

/** Wires Clerk's getToken into the API client so all fetch calls carry the JWT */
function ClerkTokenWirer() {
  const { getToken, isSignedIn } = useClerkAuthDirect();
  useEffect(() => {
    if (isSignedIn) {
      setClerkTokenGetter(async () => {
        const t = await getToken();
        return t;
      });
    }
  }, [getToken, isSignedIn]);
  return null;
}

/** Auth guard — Clerk owns sign-in state */
function RequireAuth({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useClerkAuthDirect();
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
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Shell>
              <Routes>
                <Route index element={<HomePage />} />
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
                <Route path="profile" element={<UserProfilePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
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
