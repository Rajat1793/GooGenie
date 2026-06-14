import { useEffect, useState } from "react";
import { emailApi, type EmailThread } from "../api/client.ts";
import { useEmailThreads, useMarkThreadRead, useTrashThread } from "../api/hooks.ts";
import { useClerkReady } from "../hooks/useClerkReady.ts";
import { ConnectionBar, useConnectionStatus } from "../components/ConnectBanner.tsx";

// ── Compose modal ─────────────────────────────────────────────────────────────
function ComposeModal({ onClose }: { onClose: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSend() {
    if (!to.trim() || !subject.trim() || !body.trim()) { setErr("To, subject, and body are required"); return; }
    setSending(true); setErr(null);
    try { await emailApi.send({ to, subject, body }); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to send"); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-2xl rounded-2xl flex flex-col" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)", maxHeight: "90vh" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--c-outline-variant)" }}>
          <h2 className="font-headline text-lg" style={{ color: "var(--c-on-surface)" }}>New Message</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><span className="material-symbols-outlined text-xl">close</span></button>
        </div>
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
function ThreadPane({ thread, onClose, onMarkRead, onTrash }: { thread: EmailThread; onClose: () => void; onMarkRead: (id: string) => void; onTrash: (id: string) => void }) {
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  async function handleReply() {
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      await emailApi.reply(thread.id, { to: thread.from || (thread.ownerUserId.includes("@") ? thread.ownerUserId : `${thread.ownerUserId}@example.com`), subject: thread.subject, body: replyBody });
      setReplyBody("");
    } finally { setSending(false); }
  }

  async function handleAction(action: "archive" | "read" | "unread" | "trash") {
    const map: Record<string, { add: string[]; remove: string[] }> = {
      archive: { add: [],         remove: ["INBOX"] },
      read:    { add: [],         remove: ["UNREAD"] },
      unread:  { add: ["UNREAD"], remove: [] },
      trash:   { add: [],         remove: [] }, // uses trash endpoint
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
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => handleAction("archive")} className="btn-ghost p-2" title="Archive"><span className="material-symbols-outlined text-xl">archive</span></button>
          <button onClick={() => handleAction("trash")} className="btn-ghost p-2" title="Move to trash" style={{ color: "var(--c-error)" }}><span className="material-symbols-outlined text-xl">delete</span></button>
          {thread.isUnread
            ? <button onClick={() => handleAction("read")} className="btn-ghost p-2" title="Mark read"><span className="material-symbols-outlined text-xl">mark_email_read</span></button>
            : <button onClick={() => handleAction("unread")} className="btn-ghost p-2" title="Mark unread"><span className="material-symbols-outlined text-xl">mark_email_unread</span></button>
          }
          <button onClick={onClose} className="btn-ghost p-2"><span className="material-symbols-outlined text-xl">close</span></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
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
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--c-on-surface)" }}>{thread.snippet || "(no body)"}</p>
        </div>
      </div>
      <div className="px-8 py-4" style={{ borderTop: "1px solid var(--c-outline-variant)" }}>
        <div className="flex items-center gap-3 rounded-2xl px-5 py-3" style={{ background: "var(--c-surface-container)", border: "1px solid var(--c-outline-variant)" }}>
          <input value={replyBody} onChange={(e) => setReplyBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); }}} placeholder="Reply… (Enter to send)" className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--c-on-surface)" }} />
          <button onClick={handleReply} disabled={sending || !replyBody.trim()} className="transition-all disabled:opacity-40" style={{ color: "var(--c-primary)" }}>
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
  const { status: connStatus, loading: connLoading, refresh: refreshConn } = useConnectionStatus();
  const [selected, setSelected] = useState<EmailThread | null>(null);
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "flagged">("all");
  const [serverSearch, setServerSearch] = useState(""); // debounced server search

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
    if (e.key === "Enter") { setServerSearch(search); }
    if (e.key === "Escape") { setSearch(""); setServerSearch(""); }
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

  if (!connLoading && connStatus && !connStatus.gmail) {
    return (
      <div className="pt-4">
        <h1 className="font-headline text-3xl mb-6" style={{ color: "var(--c-on-surface)" }}>Inbox</h1>
        <ConnectionBar plugins={["gmail"]} status={connStatus} loading={connLoading} onConnected={() => { refreshConn(); refetch(); }} />
      </div>
    );
  }

  // Apply filter + search
  const filtered = threads.filter((t) => {
    // Text search
    const searchOk = !search || t.subject.toLowerCase().includes(search.toLowerCase()) || t.snippet.toLowerCase().includes(search.toLowerCase()) || (t.from ?? "").toLowerCase().includes(search.toLowerCase());
    // Tab filter
    const filterOk = filter === "all" ? true
      : filter === "unread"  ? t.isUnread === true
      : filter === "flagged" ? (t.labelIds ?? []).includes("STARRED")
      : true;
    return searchOk && filterOk;
  });

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
            <button onClick={() => setComposing(true)} className="btn-primary py-2 px-4 text-xs">
              <span className="material-symbols-outlined text-sm">edit</span>
              Compose
            </button>
          </div>
          {/* Filter tabs */}
          <div className="flex gap-2 mb-3">
            {(["all", "unread", "flagged"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={filter === f
                  ? { background: "color-mix(in srgb, var(--c-primary) 15%, transparent)", color: "var(--c-primary)", border: "1px solid color-mix(in srgb, var(--c-primary) 25%, transparent)" }
                  : { background: "transparent", color: "var(--c-on-surface-variant)", border: "1px solid var(--c-outline-variant)" }}>
                {f === "unread" && unreadCount > 0 ? `Unread (${unreadCount})` : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base" style={{ color: "var(--c-outline)" }}>search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={handleSearchKey} placeholder="Search… (Enter to search server)" className="pl-9 pr-4 py-2 rounded-xl text-sm w-full outline-none" style={{ background: "var(--c-surface-container)", border: `1px solid ${serverSearch ? "var(--c-primary)" : "var(--c-outline-variant)"}`, color: "var(--c-on-surface)" }} />
            {(search || serverSearch) && (
              <button onClick={() => { setSearch(""); setServerSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--c-outline)" }}>
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Thread items */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {loading && <div className="flex items-center justify-center py-16"><span className="material-symbols-outlined animate-spin text-3xl" style={{ color: "var(--c-primary)" }}>progress_activity</span></div>}
          {error && <p className="text-sm px-4 py-8 text-center" style={{ color: "var(--c-error)" }}>{(error as Error).message}</p>}
          {!loading && filtered.length === 0 && !error && (
            <p className="text-sm px-4 py-8 text-center" style={{ color: "var(--c-on-surface-variant)" }}>
              {search ? `No results for "${search}"` : filter === "unread" ? "No unread emails" : "No threads found"}
            </p>
          )}
          {filtered.map((thread) => {
            const isActive = selected?.id === thread.id;
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
                  <span className="text-[11px] shrink-0" style={{ color: "var(--c-on-surface-variant)" }}>
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
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "var(--c-on-surface-variant)" }}>
            <span className="material-symbols-outlined text-6xl" style={{ opacity: 0.3 }}>inbox</span>
            <p className="font-headline text-2xl" style={{ color: "var(--c-on-surface-variant)" }}>Select a conversation</p>
            <p className="text-sm">Click any thread to read it</p>
          </div>
        )}
      </div>

      {composing && <ComposeModal onClose={() => { setComposing(false); refetch(); }} />}
    </div>
  );
}
