/**
 * Centralised localStorage keys.
 *
 * Previously these were magic strings scattered across App.tsx, Shell.tsx,
 * AuthContext.tsx, ThemeContext.tsx, LoginPage.tsx, CalendarPage.tsx — easy
 * to typo, hard to grep. Import from here instead.
 */
export const STORAGE_KEYS = {
  /** Role chosen on the login screen, persisted across the Clerk redirect. */
  pendingRole: "googenie-pending-role",
  /** Resolved role for a specific Clerk user id. */
  userRole: (userId: string) => `googenie-role-${userId}`,
  /** Resolved tenantId for a specific Clerk user id. */
  userTenant: (userId: string) => `googenie-tenant-${userId}`,
  /** Sidebar collapsed/expanded state. */
  sidebarCollapsed: "googenie-sidebar-collapsed",
  /** "light" | "dark" — user theme preference. */
  theme: "nimbus-theme",
  /** Calendar view mode: "list" | "month". */
  calendarView: "googenie-calendar-view",
  /** Inbox layout: "split" | "stacked". */
  inboxLayout: "googenie-inbox-layout",
  /** User-customised keyboard shortcuts (JSON map of action → key combo). */
  keybindings: "googenie-keybindings",
} as const;
