import { useEffect, useState } from "react";
import { emailApi, type EmailThread } from "../api/client.ts";
import { useClerkReady } from "../hooks/useClerkReady.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { DataState } from "../components/DataState.tsx";

// ── Compose modal ─────────────────────────────────────────────────────────────
function ComposeModal({ onClose }: { onClose: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-inverse-surface/20 backdrop-blur-sm">
      <div className="glass-panel rounded-t-2xl md:rounded-2xl w-full md:max-w-2xl shadow-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
          <h2 className="font-headline text-lg text-ink-text">New Message</h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-0 divide-y divide-outline-variant/20 px-5">
          <div className="flex items-center gap-3 py-3">
            <span className="text-xs text-on-surface-variant w-12 shrink-0">To</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipients@example.com"
              className="flex-1 bg-transparent text-sm text-ink-text outline-none placeholder:text-outline"
            />
          </div>
          <div className="flex items-center gap-3 py-3">
            <span className="text-xs text-on-surface-variant w-12 shrink-0">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 bg-transparent text-sm text-ink-text outline-none placeholder:text-outline"
            />
          </div>
        </div>

        {/* Body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Compose email…"
          className="flex-1 px-5 py-4 bg-transparent text-sm text-ink-text outline-none placeholder:text-outline resize-none min-h-[200px]"
        />

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-outline-variant/20">
          <div className="flex items-center gap-2">
            <button className="btn-ghost p-2" title="Attach file">
              <span className="material-symbols-outlined text-xl">attach_file</span>
            </button>
            <button className="btn-ghost p-2" title="Formatting">
              <span className="material-symbols-outlined text-xl">format_color_text</span>
            </button>
          </div>
          <button
            className="btn-primary px-6 py-2 text-sm flex items-center gap-2"
            onClick={onClose}
          >
            <span className="material-symbols-outlined text-base">send</span>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Thread detail drawer ───────────────────────────────────────────────────────
function ThreadDrawer({ thread, onClose }: { thread: EmailThread; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="flex-1 bg-inverse-surface/10 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-panel w-full max-w-xl h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-outline-variant/20">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="font-headline text-lg text-ink-text leading-snug truncate">{thread.subject}</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {new Date(thread.updatedAt).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 shrink-0">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Thread body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-semibold text-sm shrink-0">
                {thread.ownerUserId.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-text">{thread.ownerUserId}</p>
                <p className="text-xs text-on-surface-variant">{new Date(thread.updatedAt).toLocaleString()}</p>
              </div>
            </div>
            <p className="text-sm text-on-surface leading-relaxed">{thread.snippet}</p>
          </div>
        </div>

        {/* Quick reply */}
        <div className="px-6 py-4 border-t border-outline-variant/20">
          <div className="glass-panel rounded-xl flex items-center gap-3 px-4 py-3">
            <input
              placeholder="Reply…"
              className="flex-1 bg-transparent text-sm text-ink-text outline-none placeholder:text-outline"
            />
            <button className="text-primary hover:text-primary/70 transition-colors">
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main InboxPage ─────────────────────────────────────────────────────────────
export function InboxPage() {
  const ready = useClerkReady();
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EmailThread | null>(null);
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    emailApi.listThreads()
      .then((r) => setThreads(r.threads))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ready]);

  const filtered = threads.filter(
    (t) =>
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      t.snippet.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="pt-8">
      <PageHeader
        title="Inbox"
        subtitle={threads.length > 0 ? `${threads.length} conversation${threads.length !== 1 ? "s" : ""}` : ""}
        action={
          <button onClick={() => setComposing(true)} className="btn-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-base">edit</span>
            Compose
          </button>
        }
      />

      {/* Search bar */}
      <div className="relative mb-5">
        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-xl">search</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search threads…"
          className="input-field rounded-xl pl-10 py-3 text-sm"
        />
      </div>

      <DataState loading={loading} error={error} empty="No threads found" show={filtered.length > 0}>
        <div className="space-y-1.5">
          {filtered.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setSelected(thread)}
              className="w-full text-left glass-panel rounded-2xl px-5 py-4 flex items-start gap-4 hover:shadow-md hover:border-primary/20 transition-all group"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-semibold text-sm shrink-0 mt-0.5">
                {thread.ownerUserId.charAt(0).toUpperCase()}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-ink-text truncate">{thread.subject}</p>
                  <p className="text-[11px] text-on-surface-variant shrink-0">
                    {new Date(thread.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <p className="text-sm text-on-surface-variant truncate">{thread.snippet}</p>
              </div>

              <span className="material-symbols-outlined text-outline/50 group-hover:text-primary/40 transition-colors shrink-0 mt-1.5 text-base">chevron_right</span>
            </button>
          ))}
        </div>
      </DataState>

      {selected && <ThreadDrawer thread={selected} onClose={() => setSelected(null)} />}
      {composing && <ComposeModal onClose={() => setComposing(false)} />}
    </div>
  );
}
