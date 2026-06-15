import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { emailApi, aiApi, type EmailThread, type AiSummary, type AiSearchResult } from "../api/client.ts";
import { useEmailThreads, useMarkThreadRead, useTrashThread } from "../api/hooks.ts";
import { useClerkReady } from "../hooks/useClerkReady.ts";
import { ConnectionBar, useConnectionStatus } from "../components/ConnectBanner.tsx";
import { useFeatures } from "../context/FeatureContext.tsx";
import { FeatureDisabledCard } from "../components/FeatureDisabledCard.tsx";

// ── Compose modal ─────────────────────────────────────────────────────────────
function ComposeModal({ onClose, canAiCompose }: { onClose: () => void; canAiCompose: boolean }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // AI Compose state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTone, setAiTone] = useState<"professional" | "friendly" | "concise">("professional");
  const [aiContext, setAiContext] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAlts, setAiAlts] = useState<string[]>([]);

  async function handleSend() {
    if (!to.trim() || !subject.trim() || !body.trim()) { setErr("To, subject, and body are required"); return; }
    setSending(true); setErr(null);
    try { await emailApi.send({ to, subject, body }); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to send"); }
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
    } catch (e) { setErr(e instanceof Error ? e.message : "AI failed"); }
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
                <span className="material-symbols-outlined text-base">auto_awesome</span>
                AI Compose
              </button>
            )}
            <button onClick={onClose} className="btn-ghost p-1.5"><span className="material-symbols-outlined text-xl">close</span></button>
          </div>
        </div>

        {/* AI Compose panel */}
        {showAiPanel && (
          <div className="px-6 py-4" style={{ background: "color-mix(in srgb, var(--c-primary) 5%, transparent)", borderBottom: "1px solid var(--c-outline-variant)" }}>
            <p className="text-xs font-semibold mb-3" style={{ color: "var(--c-primary)" }}>✨ AI Compose</p>
            <div className="flex gap-2 mb-3">
              {(["professional", "friendly", "concise"] as const).map((t) => (
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
              {aiLoading ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">auto_awesome</span>}
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
            {sending ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">send</span>}
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Thread detail pane ────────────────────────────────────────────────────────
function ThreadPane({ thread, onClose, onMarkRead, onTrash, canWrite, canSummarize, canAiCompose }: { thread: EmailThread; onClose: () => void; onMarkRead: (id: string) => void; onTrash: (id: string) => void; canWrite: boolean; canSummarize: boolean; canAiCompose: boolean }) {
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  // AI Summary state
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  // AI Reply state
  const [aiReplyTone, setAiReplyTone] = useState<"professional" | "friendly" | "concise">("professional");
  const [aiReplyLoading, setAiReplyLoading] = useState(false);

  // Reset state when the user switches threads (Fix #1)
  useEffect(() => {
    setSummary(null);
    setSummaryErr(null);
    setSummaryLoading(false);
    setReplyBody("");
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
    } catch (e) { setSummaryErr(e instanceof Error ? e.message : "Failed to summarize"); }
    finally { setSummaryLoading(false); }
  }

  async function handleAiReply() {
    setAiReplyLoading(true);
    try {
      const r = await aiApi.compose({ type: "reply", tone: aiReplyTone, context: thread.subject, thread_snippet: thread.snippet, recipient_name: thread.from });
      if (r.ai_available && r.body) setReplyBody(r.body);
    } catch { /* ignore */ }
    finally { setAiReplyLoading(false); }
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

  const SENTIMENT_COLOR: Record<string, string> = {
    positive: "var(--c-primary)",
    urgent: "var(--c-error)",
    negative: "var(--c-error)",
    neutral: "var(--c-on-surface-variant)",
  };

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
              <span className="material-symbols-outlined text-base">{summaryLoading ? "progress_activity" : "auto_awesome"}</span>
              {summaryLoading ? "…" : "Summarize"}
            </button>
          )}
          <button onClick={() => handleAction("archive")} className="btn-ghost p-2" title="Archive"><span className="material-symbols-outlined text-xl">archive</span></button>
          <button onClick={() => handleAction("trash")} className="btn-ghost p-2" title="Move to trash" style={{ color: "var(--c-error)" }}><span className="material-symbols-outlined text-xl">delete</span></button>
          {thread.isUnread
            ? <button onClick={() => handleAction("read")} className="btn-ghost p-2" title="Mark read"><span className="material-symbols-outlined text-xl">mark_email_read</span></button>
            : <button onClick={() => handleAction("unread")} className="btn-ghost p-2" title="Mark unread"><span className="material-symbols-outlined text-xl">mark_email_unread</span></button>
          }
          <button onClick={onClose} className="btn-ghost p-2"><span className="material-symbols-outlined text-xl">close</span></button>
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
              <span className="material-symbols-outlined text-base">close</span>
            </button>
            <div className="flex items-center gap-2 mb-3 pr-7">
              <span className="material-symbols-outlined text-base" style={{ color: "var(--c-primary)" }}>auto_awesome</span>
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
                      <span className="material-symbols-outlined text-sm shrink-0" style={{ color: "var(--c-tertiary)" }}>task_alt</span>
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
        {/* AI Reply tone selector — only shown when canAiCompose */}
        {canAiCompose && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold" style={{ color: "var(--c-on-surface-variant)" }}>TONE:</span>
            {(["professional", "friendly", "concise"] as const).map((t) => (
              <button key={t} onClick={() => setAiReplyTone(t)}
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all capitalize"
                style={aiReplyTone === t
                  ? { background: "var(--c-primary)", color: "var(--c-on-primary)", borderColor: "var(--c-primary)" }
                  : { background: "transparent", color: "var(--c-on-surface-variant)", borderColor: "var(--c-outline-variant)" }}>
                {t}
              </button>
            ))}
            <button onClick={handleAiReply} disabled={aiReplyLoading}
              className="ml-auto btn-ghost text-[10px] flex items-center gap-1 disabled:opacity-50"
              style={{ color: "var(--c-primary)" }}>
              <span className="material-symbols-outlined text-sm">{aiReplyLoading ? "progress_activity" : "auto_awesome"}</span>
              AI Reply
            </button>
          </div>
        )}
        <div className="flex items-end gap-3 rounded-2xl px-5 py-3" style={{ background: "var(--c-surface-container)", border: "1px solid var(--c-outline-variant)" }}>
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
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
            {sending ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">send</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main InboxPage ─────────────────────────────────────────────────────────────
export function InboxPage() {
  const ready = useClerkReady();
  const { hasFeature } = useFeatures();
  const { status: connStatus, loading: connLoading, refresh: refreshConn } = useConnectionStatus();

    const [selected, setSelected] = useState<EmailThread | null>(null);
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const canWrite = hasFeature("email_write");
  // Gmail category tabs (Primary / Social / Promotions / Updates / Forums) with
  // pseudo-categories "all" and "unread" prepended for convenience.
  const [filter, setFilter] = useState<
    "all" | "unread" | "primary" | "social" | "promotions" | "updates" | "forums"
  >("all");
  const [serverSearch, setServerSearch] = useState(""); // debounced server search

  // ── Semantic AI search ────────────────────────────────────────────────────
  const canSemantic = hasFeature("ai_summary"); // reuse ai_summary as proxy for AI access
  const [aiSearchOn, setAiSearchOn] = useState(false);
  const [aiResults, setAiResults] = useState<AiSearchResult[] | null>(null);
  const [aiSearchBusy, setAiSearchBusy] = useState(false);
  const [aiSearchHint, setAiSearchHint] = useState<string | null>(null);

  async function runAiSearch(q: string) {
    if (!q.trim()) { setAiResults(null); setAiSearchHint(null); return; }
    setAiSearchBusy(true);
    setAiSearchHint(null);
    try {
      const r = await aiApi.searchEmails(q.trim(), 15);
      if (!r.ai_available) {
        setAiSearchHint("AI not configured (server is missing OPENAI_API_KEY).");
        setAiResults([]);
      } else if (r.embeddings_available === false) {
        setAiSearchHint(r.hint ?? "Vector search unavailable on this database.");
        setAiResults([]);
      } else if (r.results.length === 0) {
        setAiSearchHint("No semantically matching emails. Try indexing first.");
        setAiResults([]);
      } else {
        setAiResults(r.results);
      }
    } catch (e) {
      setAiSearchHint((e as Error).message);
      setAiResults([]);
    } finally {
      setAiSearchBusy(false);
    }
  }

  async function indexEmails() {
    setAiSearchBusy(true);
    setAiSearchHint("Indexing recent emails…");
    try {
      const r = await aiApi.indexEmails(50);
      if (!r.ai_available) setAiSearchHint("AI not configured.");
      else if (r.embeddings_available === false) setAiSearchHint("Vector DB not available.");
      else setAiSearchHint(`Indexed ${r.indexed} emails (${r.skipped} already up-to-date).`);
    } catch (e) {
      setAiSearchHint((e as Error).message);
    } finally {
      setAiSearchBusy(false);
    }
  }


  // React Query — instant cache hits on revisit + 60s background refetch
  const { data, isLoading: loading, error, refetch } = useEmailThreads({
    q: serverSearch,
    enabled: ready,
  });
  const threads: EmailThread[] = data?.threads ?? [];

  // Optimistic mutations
  const markReadMut = useMarkThreadRead();
  const trashMut = useTrashThread();

  // Trigger server search when user presses Enter
  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (aiSearchOn) void runAiSearch(search);
      else setServerSearch(search);
    }
    if (e.key === "Escape") {
      setSearch(""); setServerSearch(""); setAiResults(null); setAiSearchHint(null);
    }
  }

  // Mark a thread as read locally before server confirms (optimistic)
  function markLocalRead(threadId: string) {
    if (selected?.id === threadId) setSelected((s) => s ? { ...s, isUnread: false } : s);
    markReadMut.mutate(threadId);
  }

  // Open thread and auto-mark as read
  function openThread(thread: EmailThread) {
    setSelected(thread);
    if (thread.isUnread) markLocalRead(thread.id);
  }

  // Keep `selected` in sync if cache replaces the underlying object
  useEffect(() => {
    if (!selected) return;
    const fresh = threads.find((t) => t.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [threads, selected]);

  // Deep-link: open a specific thread when ?thread=<id> is in the URL
  // (used by the AI assistant when it references an email).
  useEffect(() => {
    const want = searchParams.get("thread");
    if (!want) return;
    const match = threads.find((t) => t.id === want);
    if (match) {
      setSelected(match);
      if (match.isUnread) markLocalRead(match.id);
      // Clear the param so reload / nav-back doesn't re-trigger.
      setSearchParams((sp) => {
        const next = new URLSearchParams(sp);
        next.delete("thread");
        return next;
      }, { replace: true });
      return;
    }
    // Thread isn't in the currently loaded list (e.g. archived, in trash, beyond
    // the page limit, or we just haven't loaded yet). Fetch it directly so the
    // assistant's email link always works.
    let cancelled = false;
    emailApi.getThread(want)
      .then((r) => {
        if (cancelled || !r?.thread) return;
        setSelected(r.thread);
        if (r.thread.isUnread) markLocalRead(r.thread.id);
      })
      .catch(() => { /* leave param so user sees no-op rather than silent failure */ })
      .finally(() => {
        if (cancelled) return;
        setSearchParams((sp) => {
          const next = new URLSearchParams(sp);
          next.delete("thread");
          return next;
        }, { replace: true });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, threads]);

    // Feature gate — show disabled card if email_read is off (MUST be after all hooks)
    if (!hasFeature("email_read")) {
      return (
        <FeatureDisabledCard
          featureKey="email_read"
          title="Inbox Locked"
          description="You don't have access to email yet. Request it from your teacher and they can enable it for you."
          icon="inbox"
        />
      );
    }

  if (!connLoading && connStatus && !connStatus.gmail) {
    return (
      <div className="pt-4">
        <h1 className="font-headline text-3xl mb-6" style={{ color: "var(--c-on-surface)" }}>Inbox</h1>
        <ConnectionBar plugins={["gmail"]} status={connStatus} loading={connLoading} onConnected={() => { refreshConn(); refetch(); }} />
      </div>
    );
  }

  // Apply filter + search
  const CATEGORY_LABEL: Record<typeof filter, string | null> = {
    all: null,
    unread: null,
    primary: "CATEGORY_PERSONAL",
    social: "CATEGORY_SOCIAL",
    promotions: "CATEGORY_PROMOTIONS",
    updates: "CATEGORY_UPDATES",
    forums: "CATEGORY_FORUMS",
  };
  const filtered = threads.filter((t) => {
    // Text search
    const searchOk = !search || t.subject.toLowerCase().includes(search.toLowerCase()) || t.snippet.toLowerCase().includes(search.toLowerCase()) || (t.from ?? "").toLowerCase().includes(search.toLowerCase());
    // Tab filter
    let filterOk: boolean;
    if (filter === "all") filterOk = true;
    else if (filter === "unread") filterOk = t.isUnread === true;
    else {
      const wanted = CATEGORY_LABEL[filter];
      const labels = t.labelIds ?? [];
      // Primary = personal mail OR threads with no explicit category label.
      filterOk = filter === "primary"
        ? labels.includes("CATEGORY_PERSONAL") || !labels.some((l) => l.startsWith("CATEGORY_"))
        : Boolean(wanted) && labels.includes(wanted!);
    }
    return searchOk && filterOk;
  });

  // When AI search is on with results, override the regular filtered list with
  // the semantic match order (preserving similarity score for badge rendering).
  const aiOrdered: Array<EmailThread & { similarity?: number }> = (aiSearchOn && aiResults && aiResults.length > 0)
    ? aiResults.map((r) => {
        const existing = threads.find((t) => t.id === r.thread_id);
        if (existing) return { ...existing, similarity: r.similarity };
        // Build a stub thread row from the embedding metadata if we don't have it cached locally
        return {
          id: r.thread_id,
          tenantId: "",
          ownerUserId: "",
          subject: r.subject ?? "(no subject)",
          snippet: r.snippet ?? "",
          from: r.from_addr ?? "unknown",
          updatedAt: new Date().toISOString(),
          isUnread: false,
          labelIds: [],
          similarity: r.similarity,
        } satisfies EmailThread & { similarity: number };
      })
    : [];

  const displayList: Array<EmailThread & { similarity?: number }> = aiSearchOn && aiResults
    ? aiOrdered
    : filtered;

  const unreadCount = threads.filter((t) => t.isUnread).length;

  return (
    <div className="flex h-[calc(100vh-112px)] -mx-8 -my-8 overflow-hidden">
      {/* ── Thread list ── */}
      <div className="w-[380px] flex flex-col shrink-0" style={{ background: "var(--c-surface-container-low)", borderRight: "1px solid var(--c-outline-variant)" }}>
        <div className="px-6 pt-4 pb-3">
          {/* Always-visible connection bar */}
          <ConnectionBar
            plugins={["gmail"]}
            status={connStatus}
            loading={connLoading}
            onConnected={() => { refreshConn(); refetch(); }}
          />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-headline text-2xl" style={{ color: "var(--c-on-surface)" }}>Inbox</h2>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold" style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}>{unreadCount}</span>
              )}
            </div>
            <button
              onClick={() => canWrite && setComposing(true)}
              disabled={!canWrite}
              title={canWrite ? undefined : "Send Email feature is disabled — request access in Profile"}
              className="btn-primary py-2 px-4 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">{canWrite ? "edit" : "lock"}</span>
              Compose
            </button>
          </div>
          {/* Filter tabs — Gmail-style category tabs */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {(
              [
                { key: "all",        label: "All",        icon: "all_inbox" },
                { key: "unread",     label: "Unread",     icon: "mark_email_unread" },
                { key: "primary",    label: "Primary",    icon: "inbox" },
                { key: "social",     label: "Social",     icon: "group" },
                { key: "promotions", label: "Promotions", icon: "local_offer" },
                { key: "updates",    label: "Updates",    icon: "info" },
                { key: "forums",     label: "Forums",     icon: "forum" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                title={f.label}
                className="px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5"
                style={filter === f.key
                  ? { background: "color-mix(in srgb, var(--c-primary) 15%, transparent)", color: "var(--c-primary)", border: "1px solid color-mix(in srgb, var(--c-primary) 25%, transparent)" }
                  : { background: "transparent", color: "var(--c-on-surface-variant)", border: "1px solid var(--c-outline-variant)" }}
              >
                <span className="material-symbols-outlined text-[14px]">{f.icon}</span>
                {f.key === "unread" && unreadCount > 0 ? `${f.label} (${unreadCount})` : f.label}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base" style={{ color: aiSearchOn ? "var(--c-tertiary)" : "var(--c-outline)" }}>{aiSearchOn ? "auto_awesome" : "search"}</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder={aiSearchOn ? "Ask in plain English… (Enter)" : "Search… (Enter to search server)"}
              className="pl-9 pr-20 py-2 rounded-xl text-sm w-full outline-none"
              style={{
                background: "var(--c-surface-container)",
                border: `1px solid ${aiSearchOn ? "var(--c-tertiary)" : (serverSearch ? "var(--c-primary)" : "var(--c-outline-variant)")}`,
                color: "var(--c-on-surface)",
              }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {(search || serverSearch || aiResults) && (
                <button
                  onClick={() => { setSearch(""); setServerSearch(""); setAiResults(null); setAiSearchHint(null); }}
                  className="p-0.5"
                  style={{ color: "var(--c-outline)" }}
                  title="Clear"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              )}
              {canSemantic && (
                <button
                  onClick={() => { setAiSearchOn((v) => !v); setAiResults(null); setAiSearchHint(null); }}
                  className="px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                  style={aiSearchOn
                    ? { background: "var(--c-tertiary)", color: "var(--c-on-tertiary)" }
                    : { background: "var(--c-surface-container-high)", color: "var(--c-on-surface-variant)", border: "1px solid var(--c-outline-variant)" }}
                  title="Toggle AI semantic search"
                >
                  AI
                </button>
              )}
            </div>
          </div>
          {aiSearchOn && (
            <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>
              <span>{aiSearchBusy ? "Searching…" : aiSearchHint ?? "Tip: \"emails about budget last week\""}</span>
              <button
                onClick={() => void indexEmails()}
                disabled={aiSearchBusy}
                className="px-2 py-0.5 rounded text-[10px] font-semibold disabled:opacity-40"
                style={{ background: "var(--c-surface-container-high)", color: "var(--c-on-surface)", border: "1px solid var(--c-outline-variant)" }}
                title="Index recent emails for semantic search"
              >
                Re-index
              </button>
            </div>
          )}
        </div>

        {/* Thread items */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {loading && <div className="flex items-center justify-center py-16"><span className="material-symbols-outlined animate-spin text-3xl" style={{ color: "var(--c-primary)" }}>progress_activity</span></div>}
          {error && <p className="text-sm px-4 py-8 text-center" style={{ color: "var(--c-error)" }}>{(error as Error).message}</p>}
          {!loading && displayList.length === 0 && !error && (
            <p className="text-sm px-4 py-8 text-center" style={{ color: "var(--c-on-surface-variant)" }}>
              {aiSearchOn && search ? `No semantic matches for "${search}"` : search ? `No results for "${search}"` : filter === "unread" ? "No unread emails" : "No threads found"}
            </p>
          )}
          {displayList.map((thread) => {
            const isActive = selected?.id === thread.id;
            const sim = thread.similarity;
            return (
              <button key={thread.id} onClick={() => openThread(thread)}
                className="w-full text-left p-4 rounded-xl transition-all duration-150 relative overflow-hidden"
                style={isActive ? { background: "var(--c-surface-container-high)", borderLeft: "3px solid var(--c-primary)", paddingLeft: "13px" } : { borderLeft: "3px solid transparent" }}>
                {/* Unread dot */}
                {thread.isUnread && (
                  <div className="absolute top-4 right-3 w-2 h-2 rounded-full" style={{ background: "var(--c-primary)" }} />
                )}
                <div className="flex items-start justify-between gap-2 mb-1 pr-4">
                  <span className={`text-xs truncate ${thread.isUnread ? "font-bold" : "font-medium"}`} style={{ color: "var(--c-on-surface-variant)" }}>
                    {thread.from || "unknown"}
                  </span>
                  <span className="text-[11px] shrink-0 flex items-center gap-1" style={{ color: "var(--c-on-surface-variant)" }}>
                    {sim !== undefined && (
                      <span
                        className="px-1 rounded text-[9px] font-bold"
                        style={{ background: "var(--c-tertiary-container)", color: "var(--c-on-tertiary-container)" }}
                        title={`Semantic similarity: ${(sim * 100).toFixed(0)}%`}
                      >
                        {Math.round(sim * 100)}%
                      </span>
                    )}
                    {new Date(thread.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className={`text-sm truncate ${thread.isUnread ? "font-bold" : "font-medium"}`} style={{ color: isActive ? "var(--c-primary)" : "var(--c-on-surface)" }}>
                  {thread.subject}
                </p>
                <p className="text-xs truncate mt-0.5" style={{ color: "var(--c-on-surface-variant)" }}>{thread.snippet}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Thread detail ── */}
      <div className="flex-1 overflow-hidden">
        {selected ? (
          <ThreadPane
            thread={selected}
            onClose={() => setSelected(null)}
            onMarkRead={markLocalRead}
            onTrash={(id) => trashMut.mutate(id)}
            canWrite={canWrite}
            canSummarize={hasFeature("ai_summary")}
            canAiCompose={canWrite && hasFeature("ai_compose")}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "var(--c-on-surface-variant)" }}>
            <span className="material-symbols-outlined text-6xl" style={{ opacity: 0.3 }}>inbox</span>
            <p className="font-headline text-2xl" style={{ color: "var(--c-on-surface-variant)" }}>Select a conversation</p>
            <p className="text-sm">Click any thread to read it</p>
          </div>
        )}
      </div>

      {composing && <ComposeModal onClose={() => { setComposing(false); refetch(); }} canAiCompose={canWrite && hasFeature("ai_compose")} />}
    </div>
  );
}
