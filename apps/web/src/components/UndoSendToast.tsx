"use client";

/**
 * Global "Undo Send" toast — listens for `googenie:undo-send` events fired
 * after a successful POST to /email/messages/schedule. Shows a single
 * persistent toast (bottom-left) with a 10s countdown ring. Click "Undo"
 * to call DELETE /email/messages/scheduled/:id and cancel the queued send.
 *
 * Mounted once in the (app) layout. Stateless apart from the in-flight
 * timer so multiple sends in quick succession just replace the previous toast.
 */
import { useEffect, useRef, useState } from "react";
import { emailApi } from "../api/client";
import { Icon } from "./Icon";

interface PendingUndo {
  id: number;
  to: string;
  subject: string;
  /** ms timestamp when the send will fire on the server. */
  sendAtMs: number;
}

export function UndoSendToast() {
  const [pending, setPending] = useState<PendingUndo | null>(null);
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  function clear() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;
    setPending(null);
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<PendingUndo>;
      if (!ce.detail || typeof ce.detail.id !== "number") return;
      const p = ce.detail;
      // Replace any previous toast.
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      setPending(p);
      const total = Math.max(0, p.sendAtMs - Date.now());
      setRemaining(Math.ceil(total / 1000));
      timerRef.current = window.setTimeout(() => clear(), total + 250);
      intervalRef.current = window.setInterval(() => {
        const left = Math.max(0, Math.ceil((p.sendAtMs - Date.now()) / 1000));
        setRemaining(left);
        if (left <= 0 && intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 250);
    };
    window.addEventListener("googenie:undo-send", handler as EventListener);
    return () => window.removeEventListener("googenie:undo-send", handler as EventListener);
  }, []);

  async function handleUndo() {
    if (!pending) return;
    try {
      await emailApi.cancelScheduled(pending.id);
      window.dispatchEvent(
        new CustomEvent("googenie:toast", {
          detail: { message: "🛑 Send undone", icon: "close" },
        }),
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent("googenie:toast", {
          detail: { message: "Too late — already sent", icon: "error" },
        }),
      );
    } finally {
      clear();
    }
  }

  if (!pending) return null;
  const total = Math.max(1, Math.round((pending.sendAtMs - new Date(0).getTime() === pending.sendAtMs ? 10 : 10)));
  const pctLeft = Math.min(100, Math.max(0, (remaining / total) * 100));

  return (
    <div
      className="fixed bottom-6 left-6 z-[260] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
      style={{
        background: "var(--c-inverse-surface)",
        color: "var(--c-inverse-on-surface)",
        minWidth: 320,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="relative w-9 h-9 shrink-0">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="none" strokeWidth="3" stroke="rgba(255,255,255,0.2)" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            strokeWidth="3"
            stroke="currentColor"
            strokeDasharray={`${(pctLeft / 100) * 100.5} 100.5`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
          {remaining}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">Sending to {pending.to}</div>
        <div className="text-[11px] opacity-80 truncate">{pending.subject}</div>
      </div>
      <button
        onClick={handleUndo}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
        style={{
          background: "var(--c-primary)",
          color: "var(--c-on-primary)",
        }}
      >
        <Icon name="refresh" className="text-sm" />
        Undo
      </button>
    </div>
  );
}
