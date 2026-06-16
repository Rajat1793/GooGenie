"use client";

import { NavLink, useNavigate } from "../lib/router-shim";
import { UserButton, useUser } from "@clerk/nextjs";
import { useAuth } from "../contexts/AuthContext";
import { useFeatures } from "../contexts/FeatureContext";
import { useTheme } from "../contexts/ThemeContext";
import { getDemoToken, setDemoToken } from "../api/client";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNotifications } from "../hooks/useNotifications";
import { RoleBadge } from "./RoleBadge";
import { AgentBar } from "./AgentBar";
import { playChime } from "../lib/chime";
import { STORAGE_KEYS } from "../lib/storage";
import { Icon } from "../components/Icon";

const NAV = [
  { to: "/inbox",    icon: "inbox",          label: "Inbox",       roles: ["super_admin","manager_admin","user"], featureKey: "email_read" },
  { to: "/calendar", icon: "calendar_today", label: "Calendar",    roles: ["super_admin","manager_admin","user"], featureKey: "calendar_read" },
  { to: "/org",      icon: "account_tree",   label: "Org Tree",    roles: ["super_admin","manager_admin","user"], featureKey: null },
  { to: "/manager",  icon: "group",          label: "My Students", roles: ["super_admin","manager_admin"],        featureKey: null },
  { to: "/admin",    icon: "shield_person",  label: "Admin",       roles: ["super_admin"],                       featureKey: null },
  { to: "/api-docs", icon: "api",            label: "API Docs",    roles: ["super_admin"],                       featureKey: null },
  { to: "/profile",  icon: "account_circle", label: "Profile",     roles: ["super_admin","manager_admin","user"], featureKey: null },
] as const;

const COLLAPSED_W = 72;
const EXPANDED_W = 256;

export function Shell({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const { user } = useUser();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { hasFeature } = useFeatures();

  const [collapsed, setCollapsed] = useState<boolean>(false);
  // SSR-safe: read localStorage after mount, never during render.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, collapsed ? "1" : "0");
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

  // ── Notifications ──────────────────────────────────────────────────────────
  const { requests, pendingCount, decide } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Listen for global toast events fired by useLiveCacheStream (Corsair
  // webhooks → SSE → here), so users see a visible "new mail" cue.
  useEffect(() => {
    function onGlobalToast(e: Event) {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) setToast(detail.message);
    }
    window.addEventListener("googenie:toast", onGlobalToast);
    return () => window.removeEventListener("googenie:toast", onGlobalToast);
  }, []);

  async function handleDecide(id: number, decision: "approved" | "denied") {
    setDecidingId(id);
    try {
      await decide(id, decision);
      playChime("out");
      setToast(decision === "approved" ? "Request approved — feature granted." : "Request denied.");
    } catch {
      setToast("Something went wrong.");
    } finally {
      setDecidingId(null);
    }
  }

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
            <Icon name="cloud" className="text-base" style={{ color: "var(--c-on-primary)", fontVariationSettings: "FILL 1" }} />
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
          <Icon name={collapsed ? "chevron_right" : "chevron_left"} className="text-[14px]" />
        </button>

        {/* Navigation */}
        <nav className={`flex-1 ${collapsed ? "px-2" : "px-3"} space-y-0.5`}>
          {navToShow.map((item) => {
            const featureLocked = item.featureKey !== null && !hasFeature(item.featureKey);
            if (featureLocked) {
              // Locked nav item — not clickable, shows lock icon, tooltip to request
              return (
                <div
                  key={item.to}
                  title={collapsed ? `${item.label} (locked — request access in Profile)` : "Request access in Profile"}
                  className={`nav-item opacity-40 cursor-not-allowed select-none ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <Icon name={item.icon} className="text-[20px] shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="text-sm flex-1">{item.label}</span>
                      <Icon name="lock" className="text-[14px]" style={{ color: "var(--c-outline)" }} />
                    </>
                  )}
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  "nav-item " + (isActive ? "nav-item-active" : "") + (collapsed ? " justify-center px-0" : "")
                }
              >
                <Icon name={item.icon} className="text-[20px] shrink-0" />
                {!collapsed && <span className="text-sm">{item.label}</span>}
              </NavLink>
            );
          })}
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
                <Icon name="logout" className="text-base" style={{ color: "var(--c-tertiary)" }} />
              </button>
            </div>
          )}
          {demoToken && collapsed && (
            <button onClick={exitDemo} className="nav-item w-full justify-center px-0" title="Exit demo">
              <Icon name="logout" className="text-[20px]" style={{ color: "var(--c-tertiary)" }} />
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggle}
            className={`nav-item w-full text-left ${collapsed ? "justify-center px-0" : ""}`}
            title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          >
            <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} className="text-[20px] shrink-0" />
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
        <header className="app-header sticky top-0 z-40 h-14 flex items-center justify-end px-8">
          {/* Right actions */}
          <div className="flex items-center gap-4">
            {/* Notification bell */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-1.5 rounded-lg transition-colors hover:bg-surface-container-high"
                style={{ color: "var(--c-on-surface-variant)" }}
                title="Notifications"
              >
                <Icon name="notifications" style={{ fontVariationSettings: pendingCount > 0 ? "FILL 1" : "FILL 0" }} />
                {pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1"
                    style={{ background: "var(--c-error)", color: "var(--c-on-error)" }}>
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </button>

              {/* Dropdown panel */}
              {notifOpen && (
                <div className="absolute right-0 top-10 w-[360px] rounded-2xl shadow-2xl z-[200] overflow-hidden"
                  style={{ background: "var(--c-surface-container-lowest)", border: "1px solid var(--c-outline-variant)" }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b"
                    style={{ borderColor: "var(--c-outline-variant)" }}>
                    <span className="text-sm font-semibold" style={{ color: "var(--c-on-surface)" }}>
                      Notifications
                      {pendingCount > 0 && (
                        <span className="ml-2 badge badge-error text-[10px]">{pendingCount} pending</span>
                      )}
                    </span>
                    <button onClick={() => setNotifOpen(false)} className="btn-ghost p-1">
                      <Icon name="close" className="text-[16px]" />
                    </button>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto">
                    {requests.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center"
                        style={{ color: "var(--c-on-surface-variant)" }}>
                        <Icon name="notifications_none" className="text-3xl opacity-40" />
                        <p className="text-xs">No notifications</p>
                      </div>
                    ) : (
                      requests.map((req) => {
                        const isPending = req.status === "pending";
                        const requesterName = req.requester?.displayName ?? req.requester?.email ?? "Someone";
                        const featureLabel = req.feature_key.replace(/_/g, " ");
                        return (
                          <div key={req.id}
                            className="px-4 py-3 border-b last:border-0 transition-colors"
                            style={{
                              borderColor: "var(--c-outline-variant)",
                              background: isPending ? "color-mix(in srgb, var(--c-tertiary) 5%, transparent)" : "transparent",
                            }}>
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{ background: isPending ? "color-mix(in srgb, var(--c-tertiary) 15%, transparent)" : "var(--c-surface-container-high)" }}>
                                <Icon name={isPending ? "request_quote" : req.status === "approved" ? "check_circle" : "cancel"} className="text-[14px]" style={{ color: isPending ? "var(--c-tertiary)" : "var(--c-on-surface-variant)" }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs" style={{ color: "var(--c-on-surface)" }}>
                                  <span className="font-semibold">{requesterName}</span>
                                  {" "}{isPending ? "requested" : req.status === "approved" ? "was granted" : "was denied"}{" "}
                                  <span className="font-semibold capitalize">{featureLabel}</span>
                                </p>
                                {req.requester && (
                                  <div className="mt-0.5">
                                    <RoleBadge role={req.requester.role as "super_admin" | "manager_admin" | "user"} />
                                  </div>
                                )}
                                <p className="text-[10px] mt-1" style={{ color: "var(--c-outline)" }}>
                                  {new Date(req.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                                </p>
                                {isPending && (
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => handleDecide(req.id, "approved")}
                                      disabled={decidingId === req.id}
                                      className="btn-primary text-[11px] px-3 py-1 disabled:opacity-50"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleDecide(req.id, "denied")}
                                      disabled={decidingId === req.id}
                                      className="btn-ghost text-[11px] px-3 py-1 disabled:opacity-50"
                                    >
                                      Deny
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-8 py-8">
          {/* Global toast for notification decisions */}
          {toast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-5 py-3 rounded-xl shadow-xl text-sm font-medium"
              style={{ background: "var(--c-surface-container-highest)", color: "var(--c-on-surface)", border: "1px solid var(--c-outline-variant)" }}>
              {toast}
            </div>
          )}
          {children}
        </main>
      </div>
      <AgentBar />
    </div>
  );
}
