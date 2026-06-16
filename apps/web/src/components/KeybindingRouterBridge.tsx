"use client";

/**
 * Connects keyboard-shortcut actions that need router/navigation access.
 * Mounted once inside the (app) layout, sits silently in the tree.
 */

import { useRouter } from "next/navigation";
import { useKeybinding } from "../contexts/KeybindingContext";

export function KeybindingRouterBridge() {
  const router = useRouter();
  useKeybinding("nav.inbox",    () => router.push("/inbox"));
  useKeybinding("nav.calendar", () => router.push("/calendar"));
  useKeybinding("nav.profile",  () => router.push("/profile"));
  useKeybinding("nav.org",      () => router.push("/org"));
  return null;
}
