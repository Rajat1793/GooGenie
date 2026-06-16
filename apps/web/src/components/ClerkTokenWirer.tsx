"use client";

import { useEffect } from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/nextjs";
import { setClerkTokenGetter, getDemoToken, authApi2, connectApi } from "../api/client";
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

        // Auto-OAuth: redirect to Google consent if not connected. Tries
        // both plugins in order. Each plugin gets ONE auto-redirect attempt
        // per browser tab session — if the user dismisses Google's consent
        // screen, the ConnectionBar banner remains so they can retry
        // explicitly. This prevents an infinite redirect loop while still
        // surfacing the connection requirement on every fresh sign-in.
        connectApi
          .status()
          .then(({ connected }) => {
            const order: Array<"gmail" | "googlecalendar"> = ["gmail", "googlecalendar"];
            for (const p of order) {
              if (connected[p]) continue;
              const flag = `googenie-auto-connect-tried:${p}`;
              if (window.sessionStorage.getItem(flag)) continue;
              window.sessionStorage.setItem(flag, "1");
              connectApi.redirectToConnect(p).catch(() => null);
              return;
            }
          })
          .catch(() => null);
      })
      .catch(() => {
        window.localStorage.removeItem(STORAGE_KEYS.pendingRole);
      });
  }, [isSignedIn, user]);

  return null;
}
