import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";
import type { ReactNode } from "react";

const navItems = [
  { to: "/admin", icon: "shield_person", label: "Admin", roles: ["super_admin"] },
  { to: "/manager", icon: "group", label: "Team", roles: ["super_admin", "manager_admin"] },
  { to: "/inbox", icon: "inbox", label: "Inbox", roles: ["super_admin", "manager_admin", "user"] },
  { to: "/calendar", icon: "calendar_month", label: "Calendar", roles: ["super_admin", "manager_admin", "user"] }
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { role, logout } = useAuth();
  const navigate = useNavigate();

  const visible = navItems.filter(
    (item) => role && (item.roles as readonly string[]).includes(role)
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="glass-header fixed top-0 inset-x-0 z-50 h-14 flex items-center justify-between px-6 border-b border-outline-variant/30">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">cloud</span>
          <span className="font-headline text-xl text-primary tracking-tight">Nimbus</span>
        </div>
        <nav className="hidden md:flex items-center gap-1">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-secondary-container text-on-secondary-container"
                    : "text-on-surface-variant hover:bg-surface-container"
                }`
              }
            >
              <span className="material-symbols-outlined text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => { logout(); navigate("/login"); }}
          className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-error transition-colors"
        >
          <span className="material-symbols-outlined text-base">logout</span>
          <span className="hidden md:inline">Sign out</span>
        </button>
      </header>

      {/* Page body */}
      <main className="flex-1 pt-14 pb-20 max-w-screen-xl mx-auto w-full px-4 md:px-8">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-background/90 backdrop-blur border-t border-outline-variant/30 flex justify-around py-2">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors ${
                isActive ? "text-primary" : "text-on-surface-variant"
              }`
            }
          >
            <span className="material-symbols-outlined text-xl">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
