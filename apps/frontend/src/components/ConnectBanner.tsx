/**
 * ConnectBanner — shown when the user hasn't connected a Google plugin yet.
 * Renders a card prompting them to connect Gmail or Google Calendar.
 */
import { useState, useEffect, useCallback } from "react";
import { connectApi } from "../api/client.ts";

interface ConnectionStatus {
  gmail: boolean;
  googlecalendar: boolean;
}

// Shared hook — call once per page that needs connection status
export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await connectApi.status();
      setStatus(data.connected);
    } catch {
      // API error — treat as not connected so the banner shows
      setStatus({ gmail: false, googlecalendar: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { status, loading, refresh };
}

interface ConnectBannerProps {
  plugin: "gmail" | "googlecalendar";
  onConnected: () => void;
}

export function ConnectBanner({ plugin, onConnected }: ConnectBannerProps) {
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const label = plugin === "gmail" ? "Gmail" : "Google Calendar";
  const icon = plugin === "gmail" ? "mail" : "calendar_month";
  const description = plugin === "gmail"
    ? "Connect your Gmail account to read, send, and manage emails directly in GooGenie."
    : "Connect your Google Calendar to view, create, and update events in GooGenie.";

  async function handleConnect() {
    setConnecting(true);
    setErr(null);
    try {
      await connectApi.connectPlugin(plugin);
      onConnected();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 px-4">
      <div className="glass-panel rounded-2xl p-8 max-w-md w-full flex flex-col items-center gap-5 text-center shadow-lg">
        <div className="w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl text-primary">{icon}</span>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-headline text-xl text-ink-text">Connect {label}</h2>
          <p className="text-sm text-on-surface-variant">{description}</p>
        </div>
        {err && (
          <div className="w-full rounded-xl bg-error-container px-4 py-2 text-sm text-error text-left">
            {err}
          </div>
        )}
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          {connecting ? (
            <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-xl">add_link</span>
          )}
          {connecting ? "Connecting…" : `Connect ${label}`}
        </button>
      </div>
    </div>
  );
}
