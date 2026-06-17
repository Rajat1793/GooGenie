"use client";

/**
 * SnoozeMenu — small dropdown anchored to a "Snooze" trigger.
 * Presents preset times (Later today, Tomorrow morning, This weekend, Next week)
 * plus a "Pick a date" option. Calls `onSnooze(wakeAt)` with an ISO string.
 *
 * Pure presentational — wiring (API call, optimistic UI) lives in the parent.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

interface Props {
  /** When non-null, the menu is open and anchored under this element. */
  trigger: React.ReactNode;
  onSnooze: (isoWakeAt: string) => void;
  /** When the thread is already snoozed, we also offer "Unsnooze". */
  isSnoozed?: boolean;
  onUnsnooze?: () => void;
}

interface Preset {
  key: string;
  label: string;
  /** Returns the wake-time as a Date computed at click. */
  compute: () => Date;
  hint: string;
}

function laterToday(): Date {
  // 3 hours from now, rounded up to the next quarter hour.
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(Math.ceil(m / 15) * 15);
  return d;
}

function tomorrowMorning(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d;
}

function thisWeekend(): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 6 ? 7 : 6 - day; // Saturday
  d.setDate(d.getDate() + diff);
  d.setHours(8, 0, 0, 0);
  return d;
}

function nextWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = ((8 - day) % 7) || 7; // next Monday
  d.setDate(d.getDate() + diff);
  d.setHours(8, 0, 0, 0);
  return d;
}

const PRESETS: Preset[] = [
  { key: "later",   label: "Later today",     compute: laterToday,     hint: "+3h"   },
  { key: "tomo",    label: "Tomorrow morning", compute: tomorrowMorning, hint: "8 AM" },
  { key: "weekend", label: "This weekend",    compute: thisWeekend,    hint: "Sat 8 AM" },
  { key: "next",    label: "Next week",       compute: nextWeek,       hint: "Mon 8 AM" },
];

function fmt(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SnoozeMenu({ trigger, onSnooze, isSnoozed, onUnsnooze }: Props) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Default custom = tomorrow morning, formatted for <input type="datetime-local">.
  const [customValue, setCustomValue] = useState<string>(() => {
    const d = tomorrowMorning();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function pick(d: Date) {
    onSnooze(d.toISOString());
    setOpen(false);
    setShowCustom(false);
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost p-2"
        title={isSnoozed ? "Manage snooze" : "Snooze thread"}
        style={{ color: isSnoozed ? "var(--c-tertiary)" : undefined }}
      >
        <Icon name="snooze" className="text-xl" />
        {trigger}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 z-50 rounded-xl py-1 shadow-lg"
          style={{
            minWidth: 240,
            background: "var(--c-surface-container)",
            border: "1px solid var(--c-outline-variant)",
          }}
        >
          {isSnoozed && onUnsnooze && (
            <button
              onClick={() => { onUnsnooze(); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-[var(--c-surface-container-high)]"
              style={{ color: "var(--c-tertiary)" }}
            >
              <Icon name="alarm_off" className="text-base" />
              <span>Unsnooze (show now)</span>
            </button>
          )}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--c-on-surface-variant)" }}>
            Snooze until
          </div>
          {PRESETS.map((p) => {
            const d = p.compute();
            return (
              <button
                key={p.key}
                onClick={() => pick(d)}
                className="w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-3 hover:bg-[var(--c-surface-container-high)]"
                style={{ color: "var(--c-on-surface)" }}
              >
                <span className="flex items-center gap-2">
                  <Icon name="schedule" className="text-base" style={{ color: "var(--c-on-surface-variant)" }} />
                  <span>{p.label}</span>
                </span>
                <span className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>{fmt(d)}</span>
              </button>
            );
          })}
          <div className="my-1" style={{ borderTop: "1px solid var(--c-outline-variant)" }} />
          {!showCustom ? (
            <button
              onClick={() => setShowCustom(true)}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-[var(--c-surface-container-high)]"
              style={{ color: "var(--c-on-surface)" }}
            >
              <Icon name="event" className="text-base" style={{ color: "var(--c-on-surface-variant)" }} />
              <span>Pick a date…</span>
            </button>
          ) : (
            <div className="px-4 py-2 space-y-2">
              <input
                type="datetime-local"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="w-full text-sm rounded-md px-2 py-1.5"
                style={{
                  background: "var(--c-surface)",
                  border: "1px solid var(--c-outline-variant)",
                  color: "var(--c-on-surface)",
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCustom(false)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: "var(--c-on-surface-variant)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const d = new Date(customValue);
                    if (!Number.isFinite(d.getTime()) || d.getTime() <= Date.now()) return;
                    pick(d);
                  }}
                  className="text-xs px-3 py-1 rounded font-semibold"
                  style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
                >
                  Snooze
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
