"use client";

import { NavLink, useNavigate } from "../lib/router-shim";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { useAuth } from "../contexts/AuthContext";
import { useFeatures } from "../contexts/FeatureContext";
import { useTheme } from "../contexts/ThemeContext";
import { getDemoToken, setDemoToken, emailApi, calendarApi, meApi, connectApi, snippetsApi } from "../api/client";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../api/queryClient";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNotifications } from "../hooks/useNotifications";
import { RoleBadge } from "./RoleBadge";
import { AgentBar } from "./AgentBar";
import { AdminSelectModal } from "./AdminSelectModal";
import { ManagerSelectModal } from "./ManagerSelectModal";
import { playChime } from "../lib/chime";
import { STORAGE_KEYS } from "../lib/storage";
import { Icon } from "../components/Icon";
import { useKeybindings, formatCombo, getEffectiveCombo } from "../contexts/KeybindingContext";

const NAV = [
  { to: "/inbox",         icon: "inbox",          label: "Inbox",         roles: ["super_admin","manager_admin","user"], featureKey: "email_read" },
  { to: "/calendar",      icon: "calendar_today", label: "Calendar",      roles: ["super_admin","manager_admin","user"], featureKey: "calendar_read" },
  { to: "/snippets",      icon: "code_blocks",    label: "Snippets",      roles: ["super_admin","manager_admin","user"], featureKey: "snippets" },
  { to: "/booking-links", icon: "event_available",label: "Booking Links", roles: ["super_admin","manager_admin","user"], featureKey: null },
  { to: "/org",           icon: "account_tree",   label: "Org Tree",      roles: ["super_admin","manager_admin","user"], featureKey: null },
  { to: "/manager",       icon: "group",          label: "My Students",   roles: ["super_admin","manager_admin"],        featureKey: null },
  { to: "/admin",         icon: "shield_person",  label: "Admin",         roles: ["super_admin"],                       featureKey: null },
  { to: "/api-docs",      icon: "api",            label: "API Docs",      roles: ["super_admin"],                       featureKey: null },
  { to: "/profile",       icon: "account_circle", label: "Profile",       roles: ["super_admin","manager_admin","user"], featureKey: null },
] as const;

// Sub-navigation rendered under the Inbox entry. Each item just pushes a
// `?folder=` param; InboxPage reads it and swaps the active filter.
const INBOX_FOLDERS: ReadonlyArray<{ key: string; icon: string; label: string; featureKey: string | null }> = [
  { key: "all",          icon: "all_inbox",         label: "All",          featureKey: null },
  { key: "unread",       icon: "mark_email_unread", label: "Unread",       featureKey: null },
  { key: "reply_needed", icon: "hourglass",         label: "Reply needed", featureKey: "ai_reply_needed" },
  { key: "drafts",       icon: "drafts",            label: "Drafts",       featureKey: null },
  { key: "sent",         icon: "send",              label: "Sent",         featureKey: null },
  { key: "primary",      icon: "inbox",             label: "Primary",      featureKey: null },
  { key: "social",       icon: "group",             label: "Social",       featureKey: null },
  { key: "promotions",   icon: "local_offer",       label: "Promotions",   featureKey: null },
  { key: "updates",      icon: "info",              label: "Updates",      featureKey: null },
  { key: "forums",       icon: "forum",             label: "Forums",       featureKey: null },
];

const COLLAPSED_W = 72;
const EXPANDED_W = 256;

export function Shell({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const { user } = useUser();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { hasFeature } = useFeatures();
  const { trigger: triggerKeybinding, bindings } = useKeybindings();
  const shortcutsCombo = formatCombo(getEffectiveCombo(bindings, "shortcuts.open"));

  // Used to decide when to render the Inbox folder sub-nav.
  const pathname = usePathname() ?? "";
  const sp = useSearchParams();
  const activeFolder = sp?.get("folder") || "all";

  // Warm up every sidebar route on mount so first navigation feels instant.
  // Next's <Link> only prefetches on hover/in-viewport (and not at all in dev
  // mode), which made Snippets / Booking Links feel sluggish on first click
  // because the route chunk had to JIT-compile after the click. Manually
  // prefetching kicks compilation off as soon as the user logs in.
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    for (const item of NAV) {
      try { router.prefetch(item.to); } catch { /* prefetch is best-effort */ }
    }
  }, [router]);

  // ── Data warm-up ─────────────────────────────────────────────────────────
  // Independent of the DemoTour (which only auto-opens for first-time users),
  // pre-populate the React Query cache for every page in the sidebar so
  // returning users also get instant navigation. We stagger in three waves:
  //   1) ~300ms — current-page-adjacent reads (inbox, calendar, connect)
  //   2) ~900ms — folder views (drafts, sent)
  //   3) ~1600ms — profile-adjacent (booking links, snippets)
  // Browsers cap HTTP/1.1 to ~6 sockets per origin; staggering keeps the
  // dev server from queueing requests behind webpack JIT compilation, which
  // is what was leaving calls stuck in "pending" for several seconds.
  useEffect(() => {
    // Only warm up once an auth token is available. Without this, prefetches
    // race the auth bootstrap and consume the 1.5s timeout, defeating the
    // entire point. Demo token is sync; Clerk token resolves via apiFetch.
    if (typeof window === "undefined") return;
    if (!getDemoToken()) return;

    const t1 = setTimeout(() => {
      void qc.prefetchQuery({
        queryKey: qk.emailThreads(),
        queryFn: () => emailApi.listThreads({}),
        staleTime: 30_000,
      });
      void qc.prefetchQuery({
        queryKey: qk.calendarEvents(),
        queryFn: () => calendarApi.listEvents({}),
        staleTime: 30_000,
      });
      void qc.prefetchQuery({
        queryKey: qk.connectStatus(),
        queryFn: () => connectApi.status(),
        staleTime: 30_000,
      });
    }, 300);

    const t2 = setTimeout(() => {
      void qc.prefetchQuery({
        queryKey: qk.emailDrafts(),
        queryFn: () => emailApi.listDrafts(),
        staleTime: 30_000,
      });
      void qc.prefetchQuery({
        queryKey: qk.emailSent(),
        queryFn: () => emailApi.listSent({}),
        staleTime: 30_000,
      });
    }, 900);

    const t3 = setTimeout(() => {
      void qc.prefetchQuery({
        queryKey: qk.bookingLinks(),
        queryFn: () => meApi.listBookingLinks(),
        staleTime: 30_000,
      });
      void qc.prefetchQuery({
        queryKey: qk.snippets(),
        queryFn: () => snippetsApi.list(),
        staleTime: 30_000,
      });
    }, 1600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [qc]);

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
        {/* Logo + collapse toggle — coral tile matches landing-page / login brand mark */}
        <div className={`flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-6"} py-6 mb-2 relative`}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--c-tertiary)" }}>
            <Icon name="auto_awesome" className="text-base" style={{ color: "var(--c-on-tertiary)", fontVariationSettings: "FILL 1" }} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="font-headline text-xl leading-tight font-semibold" style={{ color: "var(--c-on-surface)" }}>GooGenie</h1>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: "var(--c-on-surface-variant)" }}>AI Workspace</p>
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
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    "nav-item " + (isActive ? "nav-item-active" : "") + (collapsed ? " justify-center px-0" : "")
                  }
                >
                  <Icon name={item.icon} className="text-[20px] shrink-0" />
                  {!collapsed && <span className="text-sm">{item.label}</span>}
                </NavLink>

                {/* Inbox folder sub-nav — surfaces the Gmail-style category
                    tabs (All / Unread / Reply needed / Drafts / Sent /
                    Primary / Social / Promotions / Updates / Forums) right
                    under the Inbox entry so the inbox header stays
                    uncluttered. Visible only on the inbox route and when the
                    sidebar is expanded. Each entry pushes `?folder=` and
                    InboxPage syncs its filter state from that param. */}
                {item.to === "/inbox" && !collapsed && pathname.startsWith("/inbox") && (
                  <div
                    className="ml-3 mt-1 mb-1 pl-3 space-y-0.5"
                    style={{ borderLeft: "1px solid var(--sidebar-border)" }}
                  >
                    {INBOX_FOLDERS
                      .filter((f) => f.featureKey === null || hasFeature(f.featureKey))
                      .map((f) => {
                        const isActive = activeFolder === f.key;
                        return (
                          <NavLink
                            key={f.key}
                            to={`/inbox?folder=${f.key}`}
                            title={f.label}
                            className={"nav-item py-1.5 " + (isActive ? "nav-item-active" : "")}
                          >
                            <Icon name={f.icon} className="text-[16px] shrink-0" />
                            <span className="text-[13px]">{f.label}</span>
                          </NavLink>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className={`${collapsed ? "px-2" : "px-3"} pb-4 pt-3 space-y-1`} style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          {/* GooGenie Assistant launcher — opens the ChatGPT-style overlay
              rendered by <AgentBar />. Lives in the nav drawer so it doesn't
              float over page content and cover the inbox reply box. */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("googenie:agent.toggle", { detail: { open: true } }))}
            className={`nav-item w-full text-left ${collapsed ? "justify-center px-0" : ""}`}
            title={collapsed ? "Ask GooGenie" : undefined}
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, var(--c-primary), var(--c-tertiary))" }}
            >
              <span className="text-[11px]">✨</span>
            </span>
            {!collapsed && <span className="text-sm">Ask GooGenie</span>}
          </button>

          {/* Keyboard shortcuts launcher — sits directly under the Ask
              GooGenie button. Opens the KeybindingsModal via the same
              action the user could fire with mod+/.  We trigger the
              already-registered handler instead of duplicating modal
              state. */}
          <button
            onClick={() => {
              const handled = triggerKeybinding("shortcuts.open");
              // Fallback for the very first render before the modal has had
              // a chance to register its handler.
              if (!handled) {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", metaKey: true, ctrlKey: true }));
              }
            }}
            className={`nav-item w-full text-left ${collapsed ? "justify-center px-0" : ""}`}
            title={collapsed ? `Shortcuts (${shortcutsCombo})` : undefined}
          >
            <Icon name="keyboard" className="text-[20px] shrink-0" />
            {!collapsed && (
              <span className="text-sm flex-1 flex items-center justify-between">
                <span>Shortcuts</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--c-surface-container-highest)",
                    color: "var(--c-on-surface-variant)",
                    border: "1px solid var(--c-outline-variant)",
                  }}
                >
                  {shortcutsCombo}
                </span>
              </span>
            )}
          </button>

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
      {/*
        The <aside> above is `position: fixed`, so it doesn't participate in
        the parent flex layout. That means a bare `flex-1` here would size the
        content column to 100% of the viewport, and the `marginLeft` shift
        would push the column past the right edge of the screen (visible as
        the Inbox header buttons disappearing off-screen).
        Constrain the width explicitly to `100% - sidebarWidth` so the column
        fits inside the viewport, and add `min-w-0` so children that have
        long content (long subject lines, etc.) can shrink instead of forcing
        horizontal overflow.
      */}
      <div
        className="flex-1 flex flex-col min-w-0 transition-[margin-left,width] duration-200 ease-out"
        style={{
          marginLeft: `${sidebarWidth}px`,
          width: `calc(100% - ${sidebarWidth}px)`,
          maxWidth: `calc(100% - ${sidebarWidth}px)`,
        }}
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
        {/*
          `min-w-0` here is what actually allows inner flex children (like
          the Inbox split view) to shrink instead of bullying the column
          wider than the viewport. `overflow-x-hidden` is a safety net so
          that any single wide child (long unbreakable string, etc.) can't
          create a horizontal scrollbar on the whole page.
        */}
        <main className="flex-1 min-w-0 px-8 py-8 overflow-x-hidden">
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
      <AdminSelectModal />
      <ManagerSelectModal />
    </div>
  );
}
