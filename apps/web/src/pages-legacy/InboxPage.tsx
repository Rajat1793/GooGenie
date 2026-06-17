"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "../lib/router-shim";
import { emailApi, aiApi, type EmailThread, type AiSearchResult, type ReplyNeededThread } from "../api/client";
import { useEmailThreads, useMarkThreadRead, useTrashThread } from "../api/hooks";
import { useClerkReady } from "../hooks/useClerkReady";
import { ConnectionBar, useConnectionStatus } from "../components/ConnectBanner";
import { useFeatures } from "../contexts/FeatureContext";
import { FeatureDisabledCard } from "../components/FeatureDisabledCard";
import { getErrorMessage } from "../lib/errors";
import { ComposeModal } from "../components/email/ComposeModal";
import { ThreadPane } from "../components/email/ThreadPane";
import { Icon } from "../components/Icon";
import { useKeybinding } from "../contexts/KeybindingContext";
import { UnsubscribeSweepModal } from "../components/UnsubscribeSweepModal";
import DailyGapsBanner from "../components/DailyGapsBanner";
import FollowUpCard from "../components/FollowUpCard";
import TasksPanel from "../components/TasksPanel";

// ── Main InboxPage ─────────────────────────────────────────────────────────────
export function InboxPage() {
  const ready = useClerkReady();
  const { hasFeature } = useFeatures();
  const { status: connStatus, loading: connLoading, refresh: refreshConn } = useConnectionStatus();

    const [selected, setSelected] = useState<EmailThread | null>(null);
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const canWrite = hasFeature("email_write");
  // Feature C2 — unsubscribe sweep modal toggle.
  const [unsubOpen, setUnsubOpen] = useState(false);

  // Keyboard shortcuts: "/" focuses search, "c" opens compose.
  useKeybinding("inbox.focusSearch", () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  });
  useKeybinding("inbox.compose", () => {
    if (canWrite) setComposing(true);
  });
  // Gmail category tabs (Primary / Social / Promotions / Updates / Forums) with
  // pseudo-categories "all" and "unread" prepended for convenience, plus the
  // AI-driven "Reply Needed" view (Feature A2) backed by Corsair's local DB.
  const [filter, setFilter] = useState<
    "all" | "unread" | "reply_needed" | "primary" | "social" | "promotions" | "updates" | "forums"
  >("all");
  const [serverSearch, setServerSearch] = useState(""); // debounced server search

  // ── Semantic AI search ────────────────────────────────────────────────────
  const canSemantic = hasFeature("ai_summary"); // reuse ai_summary as proxy for AI access
  const [aiSearchOn, setAiSearchOn] = useState(false);
  const [aiResults, setAiResults] = useState<AiSearchResult[] | null>(null);
  const [aiSearchBusy, setAiSearchBusy] = useState(false);
  const [aiSearchHint, setAiSearchHint] = useState<string | null>(null);

  // ── Feature A2 — Reply-needed view ───────────────────────────────────────
  const [replyNeeded, setReplyNeeded] = useState<ReplyNeededThread[]>([]);
  const [replyNeededLoading, setReplyNeededLoading] = useState(false);
  useEffect(() => {
    if (filter !== "reply_needed") return;
    let cancelled = false;
    setReplyNeededLoading(true);
    emailApi
      .replyNeeded(50)
      .then((r) => { if (!cancelled) setReplyNeeded(r.threads); })
      .catch(() => { if (!cancelled) setReplyNeeded([]); })
      .finally(() => { if (!cancelled) setReplyNeededLoading(false); });
    return () => { cancelled = true; };
  }, [filter]);
  // Keep a small cached count so other tabs can show the badge without a fetch.
  useEffect(() => {
    let cancelled = false;
    emailApi
      .replyNeeded(50)
      .then((r) => { if (!cancelled) setReplyNeeded(r.threads); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAiSearch(q: string) {
    if (!q.trim()) { setAiResults(null); setAiSearchHint(null); return; }
    setAiSearchBusy(true);
    setAiSearchHint(null);
    try {
      const r = await aiApi.searchEmails(q.trim(), 15);
      if (!r.ai_available) {
        setAiSearchHint("AI not configured (server is missing MISTRAL_API_KEY).");
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
      setAiSearchHint(getErrorMessage(e));
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
      setAiSearchHint(getErrorMessage(e));
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

  // ── Live search (debounced) ────────────────────────────────────────────────
  // Old behaviour required pressing Enter to actually hit the server, which
  // felt like the search bar was dead when the locally-loaded 10 threads
  // didn't contain the query. Now we:
  //   • filter the currently-loaded list instantly as the user types, AND
  //   • after 400 ms of typing, kick off a server-side search via Corsair so
  //     the full Gmail account is queried (DB-backed: near-instant).
  // Pressing Enter still works (forces immediate server search).
  useEffect(() => {
    // Don't debounce while AI semantic mode is on — that's Enter-triggered.
    if (aiSearchOn) return;
    const trimmed = search.trim();
    // If the query just emptied, clear server search immediately
    if (!trimmed) {
      if (serverSearch) setServerSearch("");
      return;
    }
    const t = setTimeout(() => setServerSearch(trimmed), 400);
    return () => clearTimeout(t);
  }, [search, aiSearchOn, serverSearch]);

  // ── Pick up ?q=… from the global header search bar ────────────────────────
  // The Shell's top header has a search box that navigates to /inbox?q=<text>.
  // When we land here, hydrate the local search state from that URL param so
  // the user sees the input pre-filled and results immediately.
  useEffect(() => {
    const urlQ = searchParams.get("q");
    if (urlQ && urlQ !== search) {
      setSearch(urlQ);
      setServerSearch(urlQ);
      // Clear the param so navigating back/forward doesn't re-fight local state
      setSearchParams((sp) => {
        const next = new URLSearchParams(sp);
        next.delete("q");
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Trigger server search when user presses Enter (still works as a shortcut)
  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (aiSearchOn) void runAiSearch(search);
      else setServerSearch(search.trim());
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
  // We depend on the resolved `wantThreadId` rather than the whole `searchParams`
  // object so the effect doesn't re-fire when *other* query params change. We
  // also keep `threads` in the dep array so a fresh thread cache will retry the
  // local lookup before falling through to a direct fetch.
  const wantThreadId = searchParams.get("thread");
  useEffect(() => {
    if (!wantThreadId) return;
    const match = threads.find((t) => t.id === wantThreadId);
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
    emailApi.getThread(wantThreadId)
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
  }, [wantThreadId, threads]);

    // Feature gate — show disabled card if email_read is off (MUST be after all hooks)
    if (!hasFeature("email_read")) {
      return (
        <FeatureDisabledCard
          featureKey="email_read"
          title="Inbox Locked"
          description="You don't have access to email yet. Request it from your manager and they can enable it for you."
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
    reply_needed: null,
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

  // Reply-needed override: pull thread metadata from the dedicated API
  // (Corsair's local DB tells us "last message is from them, no reply").
  // Falls back to subject/from from the API row so we render the list even
  // before the regular /threads list has loaded.
  const replyOrdered: Array<EmailThread & { similarity?: number; urgency?: number; daysWaiting?: number }> =
    filter === "reply_needed"
      ? replyNeeded.map((r) => {
          const existing = threads.find((t) => t.id === r.threadId);
          if (existing) return { ...existing, urgency: r.urgency, daysWaiting: r.daysWaiting };
          return {
            id: r.threadId,
            tenantId: "",
            ownerUserId: "",
            subject: r.subject,
            snippet: r.snippet,
            from: r.from,
            updatedAt: r.lastInboundAt,
            isUnread: r.labelIds.includes("UNREAD"),
            labelIds: r.labelIds,
            urgency: r.urgency,
            daysWaiting: r.daysWaiting,
          };
        })
      : [];

  const displayList: Array<EmailThread & { similarity?: number; urgency?: number; daysWaiting?: number }> =
    filter === "reply_needed"
      ? replyOrdered
      : aiSearchOn && aiResults
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUnsubOpen(true)}
                title="Find newsletters and unsubscribe in one click"
                className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5"
              >
                <Icon name="cleaning_services" className="text-sm" />
                Cleanup
              </button>
              <button
                onClick={() => canWrite && setComposing(true)}
                disabled={!canWrite}
                title={canWrite ? undefined : "Send Email feature is disabled — request access in Profile"}
                className="btn-primary py-2 px-4 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name={canWrite ? "edit" : "lock"} className="text-sm" />
                Compose
              </button>
            </div>
          </div>
          {/* Filter tabs — Gmail-style category tabs */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {(
              [
                { key: "all",          label: "All",          icon: "all_inbox" },
                { key: "unread",       label: "Unread",       icon: "mark_email_unread" },
                { key: "reply_needed", label: "Reply needed", icon: "hourglass" },
                { key: "primary",      label: "Primary",      icon: "inbox" },
                { key: "social",       label: "Social",       icon: "group" },
                { key: "promotions",   label: "Promotions",   icon: "local_offer" },
                { key: "updates",      label: "Updates",      icon: "info" },
                { key: "forums",       label: "Forums",       icon: "forum" },
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
                <Icon name={f.icon} className="text-[14px]" />
                {f.key === "unread" && unreadCount > 0
                  ? `${f.label} (${unreadCount})`
                  : f.key === "reply_needed" && replyNeeded.length > 0
                    ? `${f.label} (${replyNeeded.length})`
                    : f.label}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <Icon name={aiSearchOn ? "auto_awesome" : "search"} className="absolute left-3 top-1/2 -translate-y-1/2 text-base" style={{ color: aiSearchOn ? "var(--c-tertiary)" : "var(--c-outline)" }} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder={aiSearchOn ? "Ask in plain English… (Enter)" : "Search Gmail (live)…"}
              className="pl-9 pr-20 py-2 rounded-xl text-sm w-full outline-none"
              style={{
                background: "var(--c-surface-container)",
                border: `1px solid ${aiSearchOn ? "var(--c-tertiary)" : (serverSearch ? "var(--c-primary)" : "var(--c-outline-variant)")}`,
                color: "var(--c-on-surface)",
              }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {/* Live-search spinner: visible while the user is typing faster
                  than the 400ms debounce, or while the server search is
                  fetching results from Gmail/Corsair DB. */}
              {!aiSearchOn && search && (loading || search.trim() !== serverSearch) && (
                <Icon name="progress_activity" className="text-base animate-spin" style={{ color: "var(--c-primary)" }} />
              )}
              {(search || serverSearch || aiResults) && (
                <button
                  onClick={() => { setSearch(""); setServerSearch(""); setAiResults(null); setAiSearchHint(null); }}
                  className="p-0.5"
                  style={{ color: "var(--c-outline)" }}
                  title="Clear"
                >
                  <Icon name="close" className="text-base" />
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
          {loading && <div className="flex items-center justify-center py-16"><Icon name="progress_activity" className="animate-spin text-3xl" style={{ color: "var(--c-primary)" }} /></div>}
          {error && <p className="text-sm px-4 py-8 text-center" style={{ color: "var(--c-error)" }}>{(error as Error).message}</p>}
          {!loading && displayList.length === 0 && !error && (
            <div className="px-4 py-8 text-center" style={{ color: "var(--c-on-surface-variant)" }}>
              <p className="text-sm">
                {aiSearchOn && search
                  ? `No semantic matches for "${search}"`
                  : search
                    ? `No results for "${search}"`
                    : filter === "unread"
                      ? "No unread emails"
                      : "No threads found"}
              </p>
              {search && !aiSearchOn && (
                <p className="text-xs mt-2 opacity-70">
                  Tip: Gmail-style operators work — try <code>from:</code>, <code>subject:</code>, <code>has:attachment</code>, or quoted phrases.
                </p>
              )}
            </div>
          )}
          {displayList.map((thread) => {
            const isActive = selected?.id === thread.id;
            const sim = thread.similarity;
            const urgency = thread.urgency;
            const daysWaiting = thread.daysWaiting;
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
                    {urgency !== undefined && urgency >= 2 && (
                      <span
                        className="px-1 rounded text-[9px] font-bold uppercase"
                        style={{
                          background: urgency === 3 ? "var(--c-error-container)" : "color-mix(in srgb, var(--c-error) 12%, transparent)",
                          color: "var(--c-error)",
                        }}
                        title={urgency === 3 ? "Urgent" : "High priority"}
                      >
                        {urgency === 3 ? "URGENT" : "PRIORITY"}
                      </span>
                    )}
                    {daysWaiting !== undefined && daysWaiting >= 1 && (
                      <span
                        className="px-1 rounded text-[9px] font-bold"
                        style={{ background: "var(--c-surface-container-high)", color: "var(--c-on-surface-variant)" }}
                        title={`Waiting ${daysWaiting} day${daysWaiting === 1 ? "" : "s"}`}
                      >
                        {daysWaiting}d
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
          {filter === "reply_needed" && !replyNeededLoading && replyOrdered.length === 0 && (
            <div className="text-center py-8 text-xs italic" style={{ color: "var(--c-on-surface-variant)" }}>
              🎉 Inbox zero on replies — nothing waiting on you.
            </div>
          )}
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
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 overflow-y-auto py-8" style={{ color: "var(--c-on-surface-variant)" }}>
            <div className="w-full max-w-2xl space-y-4">
              {/* Feature B5 — Daily gaps banner */}
              <DailyGapsBanner />

              {/* Feature C1 — Email-to-task extractor */}
              <TasksPanel />

              {/* Feature B4 — Follow-up tracker card */}
              <FollowUpCard />

              {/* Default empty state */}
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <Icon name="inbox" className="text-6xl" style={{ opacity: 0.3 }} />
                <p className="font-headline text-2xl" style={{ color: "var(--c-on-surface-variant)" }}>Select a conversation</p>
                <p className="text-sm">Click any thread to read it</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {composing && <ComposeModal onClose={() => { setComposing(false); refetch(); }} canAiCompose={canWrite && hasFeature("ai_compose")} />}
      {unsubOpen && <UnsubscribeSweepModal onClose={() => setUnsubOpen(false)} />}
    </div>
  );
}
