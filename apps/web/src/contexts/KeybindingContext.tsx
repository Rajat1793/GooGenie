"use client";

/**
 * Global keybinding registry with user customization.
 *
 * - Default bindings live in DEFAULT_BINDINGS.
 * - User overrides are persisted in localStorage under STORAGE_KEYS.keybindings.
 * - Components register a handler via `useKeybinding(actionId, handler)`.
 * - The KeybindingsModal lets the user rebind anything by capturing the
 *   next keypress.
 *
 * Combo format: lowercase, comma-separated modifiers followed by the key.
 * Examples: "mod+k", "mod+shift+i", "g i" (two-key sequence — not yet wired,
 * reserved for future). `mod` = ⌘ on macOS, Ctrl elsewhere.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_KEYS } from "../lib/storage";

export type KeybindingAction =
  | "agent.toggle"
  | "palette.toggle"
  | "nav.inbox"
  | "nav.calendar"
  | "nav.profile"
  | "nav.org"
  | "inbox.focusSearch"
  | "inbox.compose"
  | "calendar.create"
  | "shortcuts.open";

export interface KeybindingDef {
  id: KeybindingAction;
  label: string;
  defaultCombo: string;
  description?: string;
}

export const KEYBINDINGS: KeybindingDef[] = [
  { id: "palette.toggle",     label: "Open Command Palette",   defaultCombo: "mod+k",       description: "Universal palette: Ask AI / Commands / People / Threads" },
  { id: "agent.toggle",       label: "Toggle AI Agent (chat)", defaultCombo: "mod+j",       description: "Open or close the floating GooGenie chat drawer" },
  { id: "shortcuts.open",     label: "Open Keyboard Shortcuts", defaultCombo: "mod+/",      description: "Show this shortcuts panel" },
  { id: "nav.inbox",          label: "Go to Inbox",            defaultCombo: "g i",         description: "Two-key sequence: g then i" },
  { id: "nav.calendar",       label: "Go to Calendar",         defaultCombo: "g c",         description: "Two-key sequence: g then c" },
  { id: "nav.profile",        label: "Go to Profile",          defaultCombo: "g p" },
  { id: "nav.org",            label: "Go to Org Tree",         defaultCombo: "g o" },
  { id: "inbox.focusSearch",  label: "Focus Inbox Search",     defaultCombo: "/" },
  { id: "inbox.compose",      label: "Compose Email",          defaultCombo: "c" },
  { id: "calendar.create",    label: "New Calendar Event",     defaultCombo: "n" },
];

type ComboMap = Partial<Record<KeybindingAction, string>>;

interface KeybindingContextValue {
  bindings: ComboMap;
  setBinding: (id: KeybindingAction, combo: string) => void;
  resetBinding: (id: KeybindingAction) => void;
  resetAll: () => void;
  register: (id: KeybindingAction, handler: () => void) => () => void;
  /** Programmatically trigger an action (e.g. from a menu item). */
  trigger: (id: KeybindingAction) => boolean;
}

const KeybindingContext = createContext<KeybindingContextValue | null>(null);

/** Normalise a `KeyboardEvent` into our combo format ("mod+shift+k"). */
function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  // Skip pure modifier keypresses.
  if (["control", "meta", "shift", "alt"].includes(key)) return "";
  parts.push(key);
  return parts.join("+");
}

/** Pretty-print a combo for display. */
export function formatCombo(combo: string): string {
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  return combo
    .split(" ")
    .map((segment) =>
      segment
        .split("+")
        .map((p) => {
          if (p === "mod") return isMac ? "⌘" : "Ctrl";
          if (p === "shift") return isMac ? "⇧" : "Shift";
          if (p === "alt") return isMac ? "⌥" : "Alt";
          if (p === " " || p === "space") return "Space";
          if (p === "/") return "/";
          return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
        })
        .join("")
    )
    .join(" then ");
}

function shouldIgnore(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function KeybindingProvider({ children }: { children: ReactNode }) {
  const [bindings, setBindings] = useState<ComboMap>({});
  const handlersRef = useRef<Map<KeybindingAction, () => void>>(new Map());
  const sequenceRef = useRef<{ prefix: string; clearTimer: number | null }>({ prefix: "", clearTimer: null });

  // Hydrate from localStorage on mount (client-only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.keybindings);
      if (raw) setBindings(JSON.parse(raw) as ComboMap);
    } catch {
      /* corrupt JSON → ignore */
    }
  }, []);

  const persist = useCallback((next: ComboMap) => {
    setBindings(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.keybindings, JSON.stringify(next));
    } catch {
      /* quota → noop */
    }
  }, []);

  const setBinding = useCallback(
    (id: KeybindingAction, combo: string) => {
      persist({ ...bindings, [id]: combo });
    },
    [bindings, persist],
  );

  const resetBinding = useCallback(
    (id: KeybindingAction) => {
      const next = { ...bindings };
      delete next[id];
      persist(next);
    },
    [bindings, persist],
  );

  const resetAll = useCallback(() => persist({}), [persist]);

  const register = useCallback((id: KeybindingAction, handler: () => void) => {
    handlersRef.current.set(id, handler);
    return () => {
      if (handlersRef.current.get(id) === handler) {
        handlersRef.current.delete(id);
      }
    };
  }, []);

  const trigger = useCallback((id: KeybindingAction): boolean => {
    const h = handlersRef.current.get(id);
    if (h) {
      h();
      return true;
    }
    return false;
  }, []);

  // Resolve the active combo map (overrides ∪ defaults).
  const activeCombos = useMemo<Record<string, KeybindingAction>>(() => {
    const map: Record<string, KeybindingAction> = {};
    for (const def of KEYBINDINGS) {
      const combo = bindings[def.id] ?? def.defaultCombo;
      map[combo] = def.id;
    }
    return map;
  }, [bindings]);

  // Global keydown listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnore(e)) {
        // Still allow ⌘K-style chords inside inputs (escape hatch).
        if (!(e.metaKey || e.ctrlKey)) return;
      }
      const combo = eventToCombo(e);
      if (!combo) return;

      // Try the current single-press combo first.
      const directMatch = activeCombos[combo];
      if (directMatch) {
        const handled = trigger(directMatch);
        if (handled) {
          e.preventDefault();
          sequenceRef.current.prefix = "";
          if (sequenceRef.current.clearTimer) {
            window.clearTimeout(sequenceRef.current.clearTimer);
            sequenceRef.current.clearTimer = null;
          }
          return;
        }
      }

      // Otherwise treat it as a potential 2-key sequence ("g i").
      if (combo.length === 1 && !combo.includes("+")) {
        const candidate = sequenceRef.current.prefix
          ? `${sequenceRef.current.prefix} ${combo}`
          : combo;
        const seqMatch = activeCombos[candidate];
        if (seqMatch) {
          trigger(seqMatch);
          e.preventDefault();
          sequenceRef.current.prefix = "";
          if (sequenceRef.current.clearTimer) {
            window.clearTimeout(sequenceRef.current.clearTimer);
            sequenceRef.current.clearTimer = null;
          }
          return;
        }
        // Start a new sequence prefix (used only for unmodified single chars).
        sequenceRef.current.prefix = combo;
        if (sequenceRef.current.clearTimer) {
          window.clearTimeout(sequenceRef.current.clearTimer);
        }
        sequenceRef.current.clearTimer = window.setTimeout(() => {
          sequenceRef.current.prefix = "";
        }, 900);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeCombos, trigger]);

  const value = useMemo<KeybindingContextValue>(
    () => ({ bindings, setBinding, resetBinding, resetAll, register, trigger }),
    [bindings, setBinding, resetBinding, resetAll, register, trigger],
  );

  return <KeybindingContext.Provider value={value}>{children}</KeybindingContext.Provider>;
}

export function useKeybindings(): KeybindingContextValue {
  const ctx = useContext(KeybindingContext);
  if (!ctx) {
    // Safe fallback so components don't crash in tests / Storybook.
    return {
      bindings: {},
      setBinding: () => {},
      resetBinding: () => {},
      resetAll: () => {},
      register: () => () => {},
      trigger: () => false,
    };
  }
  return ctx;
}

/**
 * Register a handler for a keybinding action. The handler is invoked when
 * the user presses the active combo. Automatically deregisters on unmount.
 */
export function useKeybinding(id: KeybindingAction, handler: () => void) {
  const { register } = useKeybindings();
  // Latest-handler ref so we don't re-register on every render.
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => register(id, () => ref.current()), [id, register]);
}

export function getEffectiveCombo(bindings: ComboMap, id: KeybindingAction): string {
  const def = KEYBINDINGS.find((k) => k.id === id);
  if (!def) return "";
  return bindings[id] ?? def.defaultCombo;
}

/** Used by KeybindingsModal to capture a new combo from the next keypress. */
export function captureNextCombo(onCapture: (combo: string) => void): () => void {
  const handler = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const combo = eventToCombo(e);
    if (!combo) return; // pure modifier
    onCapture(combo);
  };
  window.addEventListener("keydown", handler, { capture: true });
  return () => window.removeEventListener("keydown", handler, { capture: true });
}
