/**
 * ConnectionBar — always-visible strip showing Gmail / Calendar status.
 * Renders on every page load; shows Connect / Reconnect for each plugin.
 *
 * ConnectBanner is kept as a thin alias for backwards compatibility.
 */
import { useState, useEffect, useCallback } from "react";
import { connectApi } from "../api/client.ts";
import { getErrorMessage } from "../lib/errors.ts";

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
              <span
                className="material-symbols-outlined text-xl shrink-0"
                style={{
                  color: connected ? "var(--c-primary)" : "var(--c-outline)",
                  fontVariationSettings: connected ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                {connected ? "check_circle" : meta.icon}
              </span>
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
                  ? <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>Connecting…</>
                  : <><span className="material-symbols-outlined text-sm">{connected ? "sync" : "add_link"}</span>{connected ? "Reconnect" : "Connect"}</>
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
