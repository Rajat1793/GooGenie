"use client";

/**
 * ConnectionBar — always-visible strip showing Gmail / Calendar status.
 * Renders on every page load; shows Connect / Reconnect for each plugin.
 *
 * ConnectBanner is kept as a thin alias for backwards compatibility.
 */
import { useState, useEffect, useCallback } from "react";
import { connectApi } from "../api/client";
import { getErrorMessage } from "../lib/errors";
import { Icon } from "../components/Icon";

export interface ConnectionStatus {
  gmail: boolean;
  googlecalendar: boolean;
}

// ── Shared hook ───────────────────────────────────────────────────────────────
export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await connectApi.status();
      setStatus(data.connected);
    } catch {
      setStatus({ gmail: false, googlecalendar: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { status, loading, refresh };
}

// ── ConnectionBar — always shown ──────────────────────────────────────────────

const PLUGIN_META = {
  gmail:          { label: "Gmail",           icon: "mail",           short: "Gmail" },
  googlecalendar: { label: "Google Calendar", icon: "calendar_month", short: "Calendar" },
} as const;

interface ConnectionBarProps {
  plugins: Array<"gmail" | "googlecalendar">;
  status: ConnectionStatus | null;
  loading?: boolean;
  onConnected: (plugin: "gmail" | "googlecalendar") => void;
}

export function ConnectionBar({ plugins, status, loading = false, onConnected }: ConnectionBarProps) {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleConnect(plugin: "gmail" | "googlecalendar") {
    setConnecting(plugin); setErr(null);
    try {
      await connectApi.connectPlugin(plugin);
      // After the popup signals success, the server token-write may not yet
      // be visible to the next status probe (DB pool / Corsair internals can
      // briefly lag). Poll the status endpoint a few times with backoff so
      // a single false read doesn't strand the user on "Not connected".
      let attempts = 0;
      const maxAttempts = 6;
      const baseDelay = 300;
      while (attempts < maxAttempts) {
        try {
          const fresh = await connectApi.status();
          if (fresh.connected[plugin]) break;
        } catch { /* swallow — retry */ }
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, baseDelay * attempts));
        }
      }
      onConnected(plugin);
    } catch (e) {
      setErr(getErrorMessage(e, "Connection failed"));
    } finally { setConnecting(null); }
  }

  if (loading) return null;

  return (
    <div className="mb-4">
      {err && (
        <div className="text-xs px-3 py-1.5 rounded-lg mb-2"
          style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>
          {err}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {plugins.map((p) => {
          const meta = PLUGIN_META[p];
          const connected = status?.[p] ?? false;
          const isConnecting = connecting === p;
          return (
            <div
              key={p}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl flex-1 min-w-[200px] transition-all"
              style={connected
                ? { background: "color-mix(in srgb, var(--c-primary) 7%, var(--c-surface-container))", border: "1px solid color-mix(in srgb, var(--c-primary) 20%, transparent)" }
                : { background: "color-mix(in srgb, var(--c-outline) 5%, var(--c-surface-container))", border: "1px dashed var(--c-outline-variant)" }}
            >
              <Icon name={connected ? "check_circle" : meta.icon} className="text-xl shrink-0" style={{
                  color: connected ? "var(--c-primary)" : "var(--c-outline)",
                  fontVariationSettings: connected ? "'FILL' 1" : "'FILL' 0",
                }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: connected ? "var(--c-primary)" : "var(--c-on-surface)" }}>
                  {meta.label}
                </p>
                <p className="text-[10px]" style={{ color: "var(--c-on-surface-variant)" }}>
                  {connected ? "Connected" : "Not connected"}
                </p>
              </div>
              <button
                onClick={() => handleConnect(p)}
                disabled={isConnecting}
                className="text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0 transition-all disabled:opacity-50"
                style={connected
                  ? { background: "var(--c-surface-container-high)", color: "var(--c-on-surface-variant)" }
                  : { background: "var(--c-primary)", color: "var(--c-on-primary)" }}
              >
                {isConnecting
                  ? <><Icon name="progress_activity" className="animate-spin text-sm" />Connecting…</>
                  : <><Icon name={connected ? "sync" : "add_link"} className="text-sm" />{connected ? "Reconnect" : "Connect"}</>
                }
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ConnectBanner — alias for backwards compat ────────────────────────────────
export function ConnectBanner({ plugin, onConnected }: { plugin: "gmail" | "googlecalendar"; onConnected: () => void }) {
  return (
    <ConnectionBar
      plugins={[plugin]}
      status={{ gmail: false, googlecalendar: false }}
      onConnected={onConnected}
    />
  );
}
