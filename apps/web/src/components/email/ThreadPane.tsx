"use client";

/**
 * Thread detail pane: subject header, AI summary card, message body iframe,
 * AI reply with tone pills, send-reply textarea. Extracted from InboxPage so
 * the page only orchestrates list ↔ thread routing and pagination.
 *
 * Behavior preserved exactly from the in-page version: tone-pill click
 * auto-regenerates AI body (when body is still AI-generated and not loading);
 * manual textarea edits flip `bodyIsAiGenerated` false to protect user edits.
 */
import { useEffect, useState } from "react";
import { emailApi, aiApi, type EmailThread, type AiSummary } from "../../api/client";
import { AI_TONES, type AiTone } from "../../lib/aiTones";
import { getErrorMessage } from "../../lib/errors";
import { Icon } from "../../components/Icon";

interface ThreadPaneProps {
  thread: EmailThread;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onTrash: (id: string) => void;
  canWrite: boolean;
  canSummarize: boolean;
  canAiCompose: boolean;
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "var(--c-primary)",
  urgent: "var(--c-error)",
  negative: "var(--c-error)",
  neutral: "var(--c-on-surface-variant)",
};

export function ThreadPane({ thread, onClose, onMarkRead, onTrash, canWrite, canSummarize, canAiCompose }: ThreadPaneProps) {
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  // AI Summary state
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  // AI Reply state
  const [aiReplyTone, setAiReplyTone] = useState<AiTone>("professional");
  const [aiReplyLoading, setAiReplyLoading] = useState(false);
  // Tracks whether the textarea currently holds AI-generated text. When true,
  // changing the tone pill will auto-regenerate; once the user manually edits
  // the body it flips false so we don't clobber their edits.
  const [bodyIsAiGenerated, setBodyIsAiGenerated] = useState(false);

  // Reset state when the user switches threads
  useEffect(() => {
    setSummary(null);
    setSummaryErr(null);
    setSummaryLoading(false);
    setReplyBody("");
    setBodyIsAiGenerated(false);
  }, [thread.id]);

  async function handleReply() {
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      await emailApi.reply(thread.id, { to: thread.from || (thread.ownerUserId.includes("@") ? thread.ownerUserId : `${thread.ownerUserId}@example.com`), subject: thread.subject, body: replyBody });
      setReplyBody("");
    } finally { setSending(false); }
  }

  async function handleSummarize() {
    setSummaryLoading(true); setSummaryErr(null);
    try {
      const r = await aiApi.summarizeThread(thread.id);
      if (!r.ai_available) { setSummaryErr(r.hint ?? "AI not configured"); return; }
      setSummary(r);
    } catch (e) { setSummaryErr(getErrorMessage(e, "Failed to summarize")); }
    finally { setSummaryLoading(false); }
  }

  async function handleAiReply(toneOverride?: AiTone) {
    const useTone = toneOverride ?? aiReplyTone;
    setAiReplyLoading(true);
    try {
      const r = await aiApi.compose({ type: "reply", tone: useTone, context: thread.subject, thread_snippet: thread.snippet, recipient_name: thread.from });
      if (r.ai_available && r.body) {
        setReplyBody(r.body);
        setBodyIsAiGenerated(true);
      }
    } catch { /* ignore */ }
    finally { setAiReplyLoading(false); }
  }

  /**
   * 1-click reply intents — generate a reply tuned to a specific intent.
   * Re-uses /ai/compose with a richer `context` string so the model knows
   * the user wants e.g. an accept vs decline vs follow-up question.
   */
  const QUICK_REPLIES: Array<{ key: string; label: string; icon: string; intent: string; tone: AiTone }> = [
    { key: "accept",   label: "Accept",        icon: "check_circle", intent: "Politely accept and confirm. Keep it warm and concise.",                  tone: "friendly" },
    { key: "decline",  label: "Decline",       icon: "do_not_disturb_on", intent: "Politely decline. Be respectful, brief, and offer a short reason.", tone: "professional" },
    { key: "more-info", label: "Ask for info", icon: "help_outline", intent: "Ask the sender for the specific details I need to respond properly.",    tone: "professional" },
    { key: "thanks",   label: "Thanks",        icon: "favorite",     intent: "Send a short, sincere thank-you reply.",                                  tone: "friendly" },
  ];

  async function handleQuickReply(intent: string, tone: AiTone) {
    setAiReplyLoading(true);
    try {
      const r = await aiApi.compose({
        type: "reply",
        tone,
        context: `${thread.subject}\n\nUser wants to: ${intent}`,
        thread_snippet: thread.snippet,
        recipient_name: thread.from,
      });
      if (r.ai_available && r.body) {
        setReplyBody(r.body);
        setBodyIsAiGenerated(true);
      }
    } catch { /* ignore */ }
    finally { setAiReplyLoading(false); }
  }

  /**
   * Switch tone pill. If the textarea currently holds AI-generated text,
   * regenerate it with the new tone immediately so the user doesn't have to
   * click "AI Reply" again. If the user has edited the body manually we just
   * remember the new tone for the next AI Reply click.
   */
  function handleToneChange(t: AiTone) {
    if (t === aiReplyTone) return;
    setAiReplyTone(t);
    if (bodyIsAiGenerated && !aiReplyLoading && canAiCompose) {
      void handleAiReply(t);
    }
  }

  async function handleAction(action: "archive" | "read" | "unread" | "trash") {
    const map: Record<string, { add: string[]; remove: string[] }> = {
      archive: { add: [],         remove: ["INBOX"] },
      read:    { add: [],         remove: ["UNREAD"] },
      unread:  { add: ["UNREAD"], remove: [] },
      trash:   { add: [],         remove: [] },
    };
    if (action === "trash") {
      onTrash(thread.id);
      onClose();
      return;
    } else {
      await emailApi.modifyLabels(thread.id, { add_label_ids: map[action].add, remove_label_ids: map[action].remove }).catch(() => null);
    }
    if (action === "read") onMarkRead(thread.id);
    onClose();
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--c-background)" }}>
      <div className="flex items-start justify-between px-8 py-5" style={{ borderBottom: "1px solid var(--c-outline-variant)" }}>
        <div className="flex-1 min-w-0 pr-4">
          <span className="section-label mb-1 block">Thread</span>
          <h2 className="font-headline text-2xl" style={{ color: "var(--c-on-surface)" }}>{thread.subject}</h2>
          <p className="text-xs mt-1" style={{ color: "var(--c-on-surface-variant)" }}>
            From: {thread.from} · {new Date(thread.updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          {canSummarize && (
            <button
              onClick={handleSummarize}
              disabled={summaryLoading}
              className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-50"
              style={{ color: "var(--c-primary)" }}
              title="Summarise with AI"
            >
              <Icon name={summaryLoading ? "progress_activity" : "auto_awesome"} className="text-base" />
              {summaryLoading ? "…" : "Summarize"}
            </button>
          )}
          <button onClick={() => handleAction("archive")} className="btn-ghost p-2" title="Archive"><Icon name="archive" className="text-xl" /></button>
          <button onClick={() => handleAction("trash")} className="btn-ghost p-2" title="Move to trash" style={{ color: "var(--c-error)" }}><Icon name="delete" className="text-xl" /></button>
          {thread.isUnread
            ? <button onClick={() => handleAction("read")} className="btn-ghost p-2" title="Mark read"><Icon name="mark_email_read" className="text-xl" /></button>
            : <button onClick={() => handleAction("unread")} className="btn-ghost p-2" title="Mark unread"><Icon name="mark_email_unread" className="text-xl" /></button>
          }
          <button onClick={onClose} className="btn-ghost p-2"><Icon name="close" className="text-xl" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
        {/* AI Summary card */}
        {summaryErr && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>{summaryErr}</div>
        )}
        {summary && (
          <div className="rounded-2xl p-5 relative" style={{ background: "color-mix(in srgb, var(--c-primary) 6%, var(--c-surface-container))", border: "1px solid color-mix(in srgb, var(--c-primary) 20%, transparent)" }}>
            <button
              onClick={() => setSummary(null)}
              className="absolute top-3 right-3 btn-ghost p-1 rounded-full"
              title="Close summary"
              aria-label="Close summary"
              style={{ color: "var(--c-on-surface-variant)" }}
            >
              <Icon name="close" className="text-base" />
            </button>
            <div className="flex items-center gap-2 mb-3 pr-7">
              <Icon name="auto_awesome" className="text-base" style={{ color: "var(--c-primary)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--c-primary)" }}>AI SUMMARY</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--c-surface-container-high)", color: SENTIMENT_COLOR[summary.sentiment] ?? "var(--c-on-surface-variant)" }}>
                {summary.sentiment}
              </span>
              <span className="text-[10px] ml-auto" style={{ color: "var(--c-outline)" }}>{summary.model}</span>
            </div>
            <p className="text-sm mb-3" style={{ color: "var(--c-on-surface)" }}>{summary.summary}</p>
            {summary.key_points.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--c-on-surface-variant)" }}>Key Points</p>
                <ul className="space-y-1">
                  {summary.key_points.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--c-on-surface)" }}>
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "var(--c-primary)" }} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.action_items.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--c-on-surface-variant)" }}>Action Items</p>
                <ul className="space-y-1">
                  {summary.action_items.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--c-on-surface)" }}>
                      <Icon name="task_alt" className="text-sm shrink-0" style={{ color: "var(--c-tertiary)" }} />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="nimbus-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: "var(--c-primary-container)", color: "var(--c-on-primary-container)" }}>
              {(thread.from || thread.ownerUserId).charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--c-on-surface)" }}>{thread.from || thread.ownerUserId}</p>
              <p className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>{new Date(thread.updatedAt).toLocaleString()}</p>
            </div>
          </div>
          {thread.bodyHtml ? (
            <iframe
              key={thread.id}
              title={thread.subject}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              srcDoc={`<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: blob:; style-src 'unsafe-inline'; font-src https: data:; media-src https: data:;"><base target="_blank"><style>html,body{margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2328;padding:8px;word-wrap:break-word}img{max-width:100%;height:auto}a{color:#2563eb;word-break:break-word}table{max-width:100%}blockquote{border-left:3px solid #d0d7de;margin:0;padding-left:12px;color:#57606a}</style></head><body>${thread.bodyHtml}</body></html>`}
              style={{ width: "100%", minHeight: "500px", border: 0, background: "white", borderRadius: 8 }}
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--c-on-surface)" }}>{thread.snippet || "(no body)"}</p>
          )}
        </div>
      </div>
      <div className="px-8 py-4" style={{ borderTop: "1px solid var(--c-outline-variant)" }}>
        {/* 1-click reply intents — small Superhuman-style suggestion chips */}
        {canAiCompose && (
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-[10px] font-semibold" style={{ color: "var(--c-on-surface-variant)" }}>QUICK REPLIES:</span>
            {QUICK_REPLIES.map((q) => (
              <button
                key={q.key}
                onClick={() => handleQuickReply(q.intent, q.tone)}
                disabled={aiReplyLoading}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium border flex items-center gap-1 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  background: "var(--c-tertiary-container)",
                  color: "var(--c-on-tertiary-container)",
                  borderColor: "var(--c-outline-variant)",
                }}
                title={`AI draft: ${q.label}`}
              >
                <Icon name={q.icon} className="text-xs" />
                {q.label}
              </button>
            ))}
          </div>
        )}
        {/* AI Reply tone selector — only shown when canAiCompose */}
        {canAiCompose && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold" style={{ color: "var(--c-on-surface-variant)" }}>TONE:</span>
            {AI_TONES.map((t) => (
              <button
                key={t}
                onClick={() => handleToneChange(t)}
                disabled={aiReplyLoading}
                title={bodyIsAiGenerated ? `Regenerate with ${t} tone` : `Set tone to ${t} for next AI Reply`}
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all capitalize disabled:opacity-50"
                style={aiReplyTone === t
                  ? { background: "var(--c-primary)", color: "var(--c-on-primary)", borderColor: "var(--c-primary)" }
                  : { background: "transparent", color: "var(--c-on-surface-variant)", borderColor: "var(--c-outline-variant)" }}>
                {t}
              </button>
            ))}
            <button onClick={() => handleAiReply()} disabled={aiReplyLoading}
              className="ml-auto btn-ghost text-[10px] flex items-center gap-1 disabled:opacity-50"
              style={{ color: "var(--c-primary)" }}>
              <Icon name={aiReplyLoading ? "progress_activity" : "auto_awesome"} className="text-sm" />
              AI Reply
            </button>
          </div>
        )}
        <div className="flex items-end gap-3 rounded-2xl px-5 py-3" style={{ background: "var(--c-surface-container)", border: "1px solid var(--c-outline-variant)" }}>
          <textarea
            value={replyBody}
            onChange={(e) => { setReplyBody(e.target.value); setBodyIsAiGenerated(false); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); }}}
            placeholder={canWrite ? "Reply… (Enter to send, Shift+Enter for newline)" : "Send Email feature disabled"}
            disabled={!canWrite}
            rows={1}
            className="flex-1 bg-transparent text-sm outline-none disabled:opacity-50 resize-none leading-relaxed py-1"
            style={{ color: "var(--c-on-surface)", maxHeight: "180px", overflowY: "auto" }}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
              }
            }}
          />
          <button onClick={handleReply} disabled={sending || !replyBody.trim() || !canWrite} className="transition-all disabled:opacity-40 self-end pb-1" style={{ color: "var(--c-primary)" }}>
            {sending ? <Icon name="progress_activity" className="animate-spin" /> : <Icon name="send" />}
          </button>
        </div>
      </div>
    </div>
  );
}
