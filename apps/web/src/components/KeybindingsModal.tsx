"use client";

/**
 * KeybindingsModal — listed shortcuts + click-to-rebind.
 *
 * Opened by the `shortcuts.open` action (default ⌘/). Click any "Change"
 * button, then press the new key combo — it's captured and persisted to
 * localStorage immediately.
 */

import { useEffect, useState } from "react";
import {
  KEYBINDINGS,
  captureNextCombo,
  formatCombo,
  getEffectiveCombo,
  useKeybinding,
  useKeybindings,
  type KeybindingAction,
} from "../contexts/KeybindingContext";
import { Icon } from "./Icon";

export function KeybindingsModal() {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState<KeybindingAction | null>(null);
  const { bindings, setBinding, resetBinding, resetAll } = useKeybindings();

  useKeybinding("shortcuts.open", () => setOpen((o) => !o));

  // Close on Escape (unless we're capturing — Escape there cancels capture).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (capturing) {
          setCapturing(null);
          e.preventDefault();
        } else {
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, capturing]);

  // While capturing, intercept the next keypress.
  useEffect(() => {
    if (!capturing) return;
    const stop = captureNextCombo((combo) => {
      setBinding(capturing, combo);
      setCapturing(null);
    });
    return stop;
  }, [capturing, setBinding]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: "var(--c-surface-container-high)",
          border: "1px solid var(--c-outline-variant)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--c-outline-variant)" }}
        >
          <div className="flex items-center gap-2">
            <Icon name="keyboard" className="text-xl" style={{ color: "var(--c-primary)" }} />
            <h2 className="font-semibold text-sm" style={{ color: "var(--c-on-surface)" }}>
              Keyboard Shortcuts
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAll}
              className="text-xs px-2 py-1 rounded hover:opacity-70"
              style={{ color: "var(--c-on-surface-variant)" }}
            >
              Reset all
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-xs px-2 py-1 rounded hover:opacity-70"
              style={{ color: "var(--c-on-surface-variant)" }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1.5">
          {KEYBINDINGS.map((def) => {
            const effective = getEffectiveCombo(bindings, def.id);
            const isCustom = bindings[def.id] !== undefined;
            const isCapturing = capturing === def.id;
            return (
              <div
                key={def.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: "var(--c-surface-container)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--c-on-surface)" }}>
                    {def.label}
                  </div>
                  {def.description && (
                    <div className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>
                      {def.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <kbd
                    className="px-2 py-1 rounded font-mono text-xs min-w-[60px] text-center"
                    style={{
                      background: isCapturing
                        ? "var(--c-primary-container)"
                        : "var(--c-surface-container-highest)",
                      color: isCapturing
                        ? "var(--c-on-primary-container)"
                        : "var(--c-on-surface)",
                      border: "1px solid var(--c-outline-variant)",
                    }}
                  >
                    {isCapturing ? "Press a key…" : formatCombo(effective)}
                  </kbd>
                  <button
                    onClick={() => setCapturing(isCapturing ? null : def.id)}
                    className="text-xs px-2 py-1 rounded hover:opacity-80"
                    style={{
                      background: "var(--c-secondary-container)",
                      color: "var(--c-on-secondary-container)",
                    }}
                  >
                    {isCapturing ? "Cancel" : "Change"}
                  </button>
                  {isCustom && !isCapturing && (
                    <button
                      onClick={() => resetBinding(def.id)}
                      className="text-xs px-1.5 py-1 rounded hover:opacity-70"
                      style={{ color: "var(--c-on-surface-variant)" }}
                      title="Reset to default"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="px-5 py-3 border-t text-[11px] text-center"
          style={{ borderColor: "var(--c-outline-variant)", color: "var(--c-on-surface-variant)" }}
        >
          Tip: shortcuts are disabled while typing in inputs (except those that include ⌘/Ctrl).
        </div>
      </div>
    </div>
  );
}
