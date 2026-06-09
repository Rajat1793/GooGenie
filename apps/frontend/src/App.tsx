import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.tsx";
import { Shell } from "./components/Shell.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { AdminLayout } from "./pages/admin/AdminLayout.tsx";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage.tsx";
import { AdminActivityPage } from "./pages/admin/AdminActivityPage.tsx";
import { ManagerLayout } from "./pages/manager/ManagerLayout.tsx";
import { ManagerTeamPage } from "./pages/manager/ManagerTeamPage.tsx";
import type { ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
                {/* Placeholder routes for future sprints */}
                <Route path="inbox" element={<PlaceholderPage title="Inbox" icon="inbox" />} />
                <Route path="calendar" element={<PlaceholderPage title="Calendar" icon="calendar_month" />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          </RequireAuth>
        }
      />
    </Routes>
  );
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
