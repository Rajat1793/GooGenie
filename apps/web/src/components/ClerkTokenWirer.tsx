"use client";

import { useEffect, useRef } from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/nextjs";
import { setClerkTokenGetter, getDemoToken, authApi2 } from "../api/client";
import { prefetchUserData } from "../api/hooks";
import { useLiveCacheStream } from "../hooks/useLiveCacheStream";
import { STORAGE_KEYS } from "../lib/storage";
import { isRole, type Role } from "../lib/roles";

/**
 * Wires Clerk's getToken into the API client so all fetch calls carry the JWT.
 * Mounted once inside the authenticated app shell.
 */
export function ClerkTokenWirer() {
  const { getToken, isSignedIn } = useClerkAuth();
  const { user } = useUser();
  // Prevents the clerk-sync effect from firing twice in StrictMode / on
  // every Clerk user-object refresh — we only need to sync once per user.
  const syncedFor = useRef<string | null>(null);

  // Live cache invalidation via SSE.
  useLiveCacheStream();

  useEffect(() => {
    if (isSignedIn) {
      setClerkTokenGetter(async () => {
        const t = await getToken();
        return t;
      });
    }
  }, [getToken, isSignedIn]);

  // Sync Clerk user to DB after sign-in. Skip for demo tokens.
  useEffect(() => {
    if (!isSignedIn || !user || getDemoToken()) return;
    if (syncedFor.current === user.id) return;
    syncedFor.current = user.id;

    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      "";
    const displayName = user.fullName ?? user.firstName ?? email.split("@")[0];
    const rawPending =
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEYS.pendingRole)
        : null;
    const pendingRole: Role | null = isRole(rawPending) ? rawPending : null;

    authApi2
      .clerkSync(email, displayName, pendingRole ?? undefined)
      .then((r) => {
        if (user?.id) {
          window.sessionStorage.setItem(STORAGE_KEYS.userRole(user.id), r.user.role);
          window.sessionStorage.setItem(STORAGE_KEYS.userTenant(user.id), r.user.tenantId);
        }
        window.dispatchEvent(
          new CustomEvent("googenie:role-synced", {
            detail: { role: r.user.role, tenantId: r.user.tenantId },
          })
        );
        window.localStorage.removeItem(STORAGE_KEYS.pendingRole);
        prefetchUserData().catch(() => null);
        // NOTE: We intentionally do NOT auto-redirect to Google OAuth here.
        // The ConnectionBar shown on Inbox/Calendar already prompts users to
        // click Connect for Gmail / Calendar. Auto-redirecting was causing
        // an OAuth-loop where users hit the Google consent screen twice
        // (once per plugin) on every fresh sign-in — even worse if Clerk's
        // `user` reference re-fired the effect.
      })
      .catch(() => {
        window.localStorage.removeItem(STORAGE_KEYS.pendingRole);
        // Allow a retry on next render if the sync failed.
        syncedFor.current = null;
      });
  }, [isSignedIn, user]);

  return null;
}
