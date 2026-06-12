import { NavLink } from "react-router-dom";
import { UserButton, useUser } from "@clerk/react";
import { useAuth } from "../context/AuthContext.tsx";
import type { ReactNode } from "react";

const navItems = [
  { to: "/admin",    icon: "shield_person",  label: "Admin",    roles: ["super_admin"] },
  { to: "/manager",  icon: "group",           label: "Team",     roles: ["super_admin", "manager_admin"] },
  { to: "/inbox",    icon: "inbox",           label: "Inbox",    roles: ["super_admin", "manager_admin", "user"] },
  { to: "/calendar", icon: "calendar_month",  label: "Calendar", roles: ["super_admin", "manager_admin", "user"] },
  { to: "/profile",  icon: "account_circle",  label: "Profile",  roles: ["super_admin", "manager_admin", "user"] }
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const { user } = useUser();

  const visible = navItems.filter(
    (item) => role && (item.roles as readonly string[]).includes(role)
  );

  // Show all nav items when role not yet loaded (user just signed in)
  const navToShow = visible.length > 0 ? visible : navItems.filter(i => (i.roles as readonly string[]).includes("user"));

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="glass-header fixed top-0 inset-x-0 z-50 h-14 flex items-center justify-between px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-xl bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-sm">cloud</span>
          </div>
          <span className="font-headline text-lg text-primary tracking-tight select-none">Googenie</span>
        </div>

        {/* Nav pill */}
        <nav className="hidden md:flex items-center gap-0.5 bg-surface-container/60 rounded-full px-2 py-1.5 border border-outline-variant/20">
          {navToShow.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-primary text-white shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-white"
                }`
              }
            >
              <span className="material-symbols-outlined text-[17px]">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Clerk UserButton + name */}
        <div className="flex items-center gap-2.5">
          {user && (
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-xs font-semibold text-ink-text">{user.fullName ?? user.firstName ?? user.emailAddresses[0]?.emailAddress}</span>
              <span className="text-[10px] text-outline">{user.primaryEmailAddress?.emailAddress}</span>
            </div>
          )}
          <UserButton />
        </div>
      </header>

      {/* Page body */}
      <main className="flex-1 pt-14 pb-24 max-w-screen-xl mx-auto w-full px-4 md:px-8">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/90 backdrop-blur-xl border-t border-outline-variant/25 flex justify-around py-2 px-4">
        {navToShow.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium transition-colors ${
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

