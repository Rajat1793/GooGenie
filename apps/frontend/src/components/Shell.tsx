import { NavLink, useNavigate } from "react-router-dom";
import { UserButton, useUser } from "@clerk/react";
import { useAuth } from "../context/AuthContext.tsx";
import { useTheme } from "../context/ThemeContext.tsx";
import { getDemoToken, setDemoToken } from "../api/client.ts";
import { useState, useEffect, type ReactNode } from "react";

const NAV = [
  { to: "/inbox",    icon: "inbox",          label: "Inbox",    roles: ["super_admin","manager_admin","user"] },
  { to: "/calendar", icon: "calendar_today",  label: "Calendar", roles: ["super_admin","manager_admin","user"] },
  { to: "/org",      icon: "account_tree",    label: "Org Tree", roles: ["super_admin","manager_admin","user"] },
  { to: "/manager",  icon: "group",           label: "My Students", roles: ["super_admin","manager_admin"] },
  { to: "/admin",    icon: "shield_person",   label: "Admin",    roles: ["super_admin"] },
  { to: "/api-docs", icon: "api",             label: "API Docs", roles: ["super_admin"] },
  { to: "/profile",  icon: "account_circle",  label: "Profile",  roles: ["super_admin","manager_admin","user"] },
] as const;

const COLLAPSED_W = 72;
const EXPANDED_W = 256;

export function Shell({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const { user } = useUser();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("googenie-sidebar-collapsed") === "1";
  });

  useEffect(() => {
    localStorage.setItem("googenie-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // Decode demo token if active
  const demoToken = getDemoToken();
  let demoPayload: { sub: string; role: string; tenant_id: string } | null = null;
  if (demoToken) {
    try {
      const [payloadB64] = demoToken.split(".");
      demoPayload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    } catch { /* ignore */ }
  }

  const effectiveRole = (demoPayload?.role ?? role) as string;
  const ROLE_LABELS: Record<string, string> = { super_admin: "Big Boss", manager_admin: "Teacher", user: "Student" };

  const visible = NAV.filter(
    (item) => effectiveRole && (item.roles as readonly string[]).includes(effectiveRole)
  );
  const navToShow = visible.length > 0 ? visible : NAV.filter(i => (i.roles as readonly string[]).includes("user"));

  function exitDemo() {
    setDemoToken(null);
    navigate("/login");
  }

  const sidebarWidth = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <div className="flex min-h-screen" style={{ background: "var(--c-background)", color: "var(--c-on-surface)" }}>

      {/* ── Sidebar ── */}
      <aside
        className="sidebar fixed left-0 top-0 h-screen flex flex-col z-50 transition-[width] duration-200 ease-out"
        style={{
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)",
          width: `${sidebarWidth}px`,
        }}
      >
        {/* Logo + collapse toggle */}
        <div className={`flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-6"} py-6 mb-2 relative`}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--c-primary)" }}>
            <span className="material-symbols-outlined text-base" style={{ color: "var(--c-on-primary)", fontVariationSettings: "FILL 1" }}>cloud</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="font-headline text-xl leading-tight" style={{ color: "var(--c-primary)" }}>GooGenie</h1>
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--c-on-surface-variant)" }}>AI Workspace</p>
            </div>
          )}
        </div>

        {/* Hamburger toggle button (always visible, anchored to right edge of sidebar) */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-7 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-all hover:scale-110"
          style={{ background: "var(--c-surface-container-high)", border: "1px solid var(--c-outline-variant)", color: "var(--c-on-surface-variant)" }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="material-symbols-outlined text-[14px]">{collapsed ? "chevron_right" : "chevron_left"}</span>
        </button>

        {/* Navigation */}
        <nav className={`flex-1 ${collapsed ? "px-2" : "px-3"} space-y-0.5`}>
          {navToShow.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                "nav-item " + (isActive ? "nav-item-active" : "") + (collapsed ? " justify-center px-0" : "")
              }
            >
              <span className="material-symbols-outlined text-[20px] shrink-0">{item.icon}</span>
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className={`${collapsed ? "px-2" : "px-3"} pb-4 pt-3 space-y-1`} style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          {/* Demo banner */}
          {demoToken && !collapsed && (
            <div className="px-4 py-2 rounded-xl mb-2 flex items-center justify-between" style={{ background: "color-mix(in srgb, var(--c-tertiary) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--c-tertiary) 25%, transparent)" }}>
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--c-tertiary)" }}>Demo Mode</p>
                <p className="text-[10px]" style={{ color: "var(--c-on-surface-variant)" }}>{ROLE_LABELS[effectiveRole] ?? effectiveRole}</p>
              </div>
              <button onClick={exitDemo} className="btn-ghost p-1" title="Exit demo">
                <span className="material-symbols-outlined text-base" style={{ color: "var(--c-tertiary)" }}>logout</span>
              </button>
            </div>
          )}
          {demoToken && collapsed && (
            <button onClick={exitDemo} className="nav-item w-full justify-center px-0" title="Exit demo">
              <span className="material-symbols-outlined text-[20px]" style={{ color: "var(--c-tertiary)" }}>logout</span>
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggle}
            className={`nav-item w-full text-left ${collapsed ? "justify-center px-0" : ""}`}
            title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          >
            <span className="material-symbols-outlined text-[20px] shrink-0">{theme === "dark" ? "light_mode" : "dark_mode"}</span>
            {!collapsed && <span className="text-sm">{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
          </button>

          {/* User (hidden in demo mode) */}
          {!demoToken && (
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3 px-4"} py-3`}>
              <UserButton />
              {!collapsed && user && (
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--c-on-surface)" }}>
                    {user.fullName ?? user.firstName ?? "User"}
                  </span>
                  <span className="text-[10px] truncate" style={{ color: "var(--c-on-surface-variant)" }}>
                    {user.primaryEmailAddress?.emailAddress}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div
        className="flex-1 flex flex-col transition-[margin-left] duration-200 ease-out"
        style={{ marginLeft: `${sidebarWidth}px` }}
      >
        {/* Top header */}
        <header className="app-header sticky top-0 z-40 h-14 flex items-center justify-between px-8">
          {/* Search */}
          <div className="relative max-w-xs w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px]" style={{ color: "var(--c-outline)" }}>search</span>
            <input
              className="pl-10 pr-4 py-1.5 rounded-full text-sm w-full outline-none transition-all"
              placeholder="Search... (Cmd+K)"
              style={{
                background: "var(--c-surface-container-low)",
                border: "1px solid var(--c-outline-variant)",
                color: "var(--c-on-surface)",
              }}
            />
          </div>
          {/* Right actions */}
          <div className="flex items-center gap-4">
            <button className="relative" style={{ color: "var(--c-on-surface-variant)" }}>
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-0 right-0 w-2 h-2 rounded-full border-2" style={{ background: "var(--c-secondary)", borderColor: "var(--c-background)" }} />
            </button>
            <button style={{ color: "var(--c-on-surface-variant)" }}>
              <span className="material-symbols-outlined">apps</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
