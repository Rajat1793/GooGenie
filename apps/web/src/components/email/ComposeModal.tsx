"use client";

/**
 * New-message compose modal. Extracted from InboxPage so the page itself
 * only owns list/detail orchestration. Self-contained: owns its own state,
 * dispatches `emailApi.send` then closes via the parent callback.
 */
import { useState } from "react";
import { emailApi, aiApi } from "../../api/client";
import { AI_TONES, type AiTone } from "../../lib/aiTones";
import { getErrorMessage } from "../../lib/errors";
import { Icon } from "../../components/Icon";

interface ComposeModalProps {
  onClose: () => void;
  canAiCompose: boolean;
}

export function ComposeModal({ onClose, canAiCompose }: ComposeModalProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // AI Compose state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTone, setAiTone] = useState<AiTone>("professional");
  const [aiContext, setAiContext] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAlts, setAiAlts] = useState<string[]>([]);

  async function handleSend() {
    if (!to.trim() || !subject.trim() || !body.trim()) { setErr("To, subject, and body are required"); return; }
    setSending(true); setErr(null);
    try {
      // Queue with a 10s undo window. The poller in instrumentation.ts will
      // flush it. The UndoSendToast (mounted in the app layout) listens for
      // the custom event below and shows a countdown ring + Undo button.
      const scheduled = await emailApi.schedule({ to, subject, body, delay_seconds: 10 });
      window.dispatchEvent(
        new CustomEvent("googenie:undo-send", {
          detail: {
            id: scheduled.id,
            to: scheduled.to,
            subject: scheduled.subject,
            sendAtMs: new Date(scheduled.sendAt).getTime(),
          },
        }),
      );
      onClose();
    }
    catch (e) { setErr(getErrorMessage(e, "Failed to send")); }
    finally { setSending(false); }
  }

  async function handleAiGenerate() {
    if (!aiContext.trim() && !subject.trim()) { setErr("Add a subject or context for AI to use"); return; }
    setAiLoading(true); setErr(null);
    try {
      const r = await aiApi.compose({ type: "new", tone: aiTone, context: aiContext || subject, recipient_name: to });
      if (!r.ai_available) { setErr(r.hint ?? "AI not configured"); return; }
      setBody(r.body);
      if (r.subject && !subject) setSubject(r.subject);
      setAiAlts(r.alternatives ?? []);
      setShowAiPanel(false);
    } catch (e) { setErr(getErrorMessage(e, "AI failed")); }
    finally { setAiLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-2xl rounded-2xl flex flex-col" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)", maxHeight: "90vh" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--c-outline-variant)" }}>
          <h2 className="font-headline text-lg" style={{ color: "var(--c-on-surface)" }}>New Message</h2>
          <div className="flex items-center gap-2">
            {canAiCompose && (
              <button
                onClick={() => setShowAiPanel(!showAiPanel)}
                className="btn-ghost text-xs flex items-center gap-1"
                style={{ color: showAiPanel ? "var(--c-primary)" : undefined }}
                title="AI Compose"
              >
                <Icon name="auto_awesome" className="text-base" />
                AI Compose
              </button>
            )}
            <button onClick={onClose} className="btn-ghost p-1.5"><Icon name="close" className="text-xl" /></button>
          </div>
        </div>

        {/* AI Compose panel */}
        {showAiPanel && (
          <div className="px-6 py-4" style={{ background: "color-mix(in srgb, var(--c-primary) 5%, transparent)", borderBottom: "1px solid var(--c-outline-variant)" }}>
            <p className="text-xs font-semibold mb-3" style={{ color: "var(--c-primary)" }}>✨ AI Compose</p>
            <div className="flex gap-2 mb-3">
              {AI_TONES.map((t) => (
                <button key={t} onClick={() => setAiTone(t)}
                  className="px-3 py-1 rounded-full text-xs font-semibold border transition-all capitalize"
                  style={aiTone === t
                    ? { background: "var(--c-primary)", color: "var(--c-on-primary)", borderColor: "var(--c-primary)" }
                    : { background: "transparent", color: "var(--c-on-surface-variant)", borderColor: "var(--c-outline-variant)" }}>
                  {t}
                </button>
              ))}
            </div>
            <input value={aiContext} onChange={(e) => setAiContext(e.target.value)}
              placeholder="What's this email about? (optional — uses subject if empty)"
              className="input-field rounded-xl text-sm mb-3" />
            <button onClick={handleAiGenerate} disabled={aiLoading}
              className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5">
              {aiLoading ? <Icon name="progress_activity" className="animate-spin text-sm" /> : <Icon name="auto_awesome" className="text-sm" />}
              {aiLoading ? "Generating…" : "Generate"}
            </button>
            {aiAlts.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-semibold" style={{ color: "var(--c-on-surface-variant)" }}>ALTERNATIVES (click to use)</p>
                {aiAlts.map((alt, i) => (
                  <button key={i} onClick={() => setBody(alt)}
                    className="w-full text-left text-xs px-3 py-2 rounded-xl border transition-all hover:border-primary"
                    style={{ background: "var(--c-surface-container)", borderColor: "var(--c-outline-variant)", color: "var(--c-on-surface)" }}>
                    {alt.slice(0, 120)}{alt.length > 120 ? "…" : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {err && <div className="mx-6 mt-3 rounded-xl px-4 py-2 text-sm" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>{err}</div>}
        <div className="flex flex-col px-6" style={{ borderTop: "1px solid var(--c-outline-variant)" }}>
          {[{ label: "To", value: to, set: setTo, placeholder: "recipients@example.com" }, { label: "Subject", value: subject, set: setSubject, placeholder: "Subject" }].map((f, i) => (
            <div key={f.label} className="flex items-center gap-3 py-3" style={i > 0 ? { borderTop: "1px solid var(--c-outline-variant)" } : {}}>
              <span className="text-xs font-semibold w-14 shrink-0" style={{ color: "var(--c-on-surface-variant)" }}>{f.label}</span>
              <input value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder} className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--c-on-surface)" }} />
            </div>
          ))}
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Compose…" className="flex-1 px-6 py-4 bg-transparent text-sm outline-none resize-none min-h-[180px]" style={{ color: "var(--c-on-surface)" }} />
        <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--c-outline-variant)" }}>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSend} disabled={sending} className="btn-primary disabled:opacity-50 flex items-center gap-2">
            {sending ? <Icon name="progress_activity" className="animate-spin text-base" /> : <Icon name="send" className="text-base" />}
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
