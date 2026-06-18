"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "../lib/router-shim";
import { emailApi, type EmailThread, type ReplyNeededThread, type DraftSummary } from "../api/client";
import { useEmailThreads, useMarkThreadRead, useTrashThread, useSentThreads, useDrafts } from "../api/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../api/queryClient";
import { useClerkReady } from "../hooks/useClerkReady";
import { ConnectionBar, useConnectionStatus } from "../components/ConnectBanner";
import { useFeatures } from "../contexts/FeatureContext";
import { FeatureDisabledCard } from "../components/FeatureDisabledCard";
import { ComposeModal } from "../components/email/ComposeModal";
import { ThreadPane } from "../components/email/ThreadPane";
import { Icon } from "../components/Icon";
import { useKeybinding } from "../contexts/KeybindingContext";
import { UnsubscribeSweepModal } from "../components/UnsubscribeSweepModal";
import DailyGapsBanner from "../components/DailyGapsBanner";
import FollowUpCard from "../components/FollowUpCard";
import TasksPanel from "../components/TasksPanel";
import { DigestPanel } from "../components/DigestPanel";
import { STORAGE_KEYS } from "../lib/storage";

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
  const canSplitView = hasFeature("split_inbox_view");
  // Feature C2 — unsubscribe sweep modal toggle.
  const [unsubOpen, setUnsubOpen] = useState(false);

  // Layout: "split" (default) shows list + reading pane side-by-side; "stacked"
  // hides the right pane until a thread is selected, then renders it modal-style.
  // Persisted in localStorage so the user's preference survives reloads.
  const [layout, setLayout] = useState<"split" | "stacked">("split");
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEYS.inboxLayout) as "split" | "stacked" | null;
    if (saved === "split" || saved === "stacked") setLayout(saved);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateViewportMode = () => {
      // Split mode needs enough horizontal room for sidebar + thread list + pane.
      // On smaller widths, force stacked so content never clips off-screen.
      setIsNarrowViewport(window.innerWidth < 1280);
    };
    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);
  useEffect(() => {
    if (isNarrowViewport && layout === "split") {
      setLayout("stacked");
    }
  }, [isNarrowViewport, layout]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.inboxLayout, layout);
  }, [layout]);

  // Auto-open Compose if we navigated here with ?compose=1 (e.g. from the
  // agent "Compose another" chip). Strip the param afterwards so reloads
  // don't re-open the modal.
  useEffect(() => {
    if (!searchParams) return;
    if (searchParams.get("compose") === "1" && canWrite) {
      setComposing(true);
      const next = new URLSearchParams(searchParams);
      next.delete("compose");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, canWrite, setSearchParams]);

  // Focused-but-not-yet-opened index for j/k navigation. The user can step
  // through the list with j/k and press Enter to open the focused thread.
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

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
  // "drafts" and "sent" swap the data source (drafts.list / sent threads) but
  // render in the same left column to keep the inbox shell consistent.
  const [filter, setFilter] = useState<
    | "all" | "unread" | "reply_needed"
    | "primary" | "social" | "promotions" | "updates" | "forums"
    | "drafts" | "sent"
  >("all");
  const [serverSearch, setServerSearch] = useState(""); // debounced server search

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

  // React Query — instant cache hits on revisit + 60s background refetch
  const { data, isLoading: loading, error, refetch } = useEmailThreads({
    q: serverSearch,
    enabled: ready,
  });
  const threads: EmailThread[] = data?.threads ?? [];

  // Sent / Drafts folders — fetched lazily, only when their tab is active.
  // Keeping them disabled until selection prevents two extra Gmail round-trips
  // on every inbox load.
  const sentQuery = useSentThreads({
    q: serverSearch,
    enabled: ready && filter === "sent",
  });
  const sentThreads: EmailThread[] = sentQuery.data?.threads ?? [];

  const draftsQuery = useDrafts({ enabled: ready && filter === "drafts" });
  const drafts: DraftSummary[] = draftsQuery.data?.drafts ?? [];
  const qc = useQueryClient();
  const [draftBusyId, setDraftBusyId] = useState<string | null>(null);

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
    const trimmed = search.trim();
    // If the query just emptied, clear server search immediately
    if (!trimmed) {
      if (serverSearch) setServerSearch("");
      return;
    }
    const t = setTimeout(() => setServerSearch(trimmed), 400);
    return () => clearTimeout(t);
  }, [search, serverSearch]);

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
      setServerSearch(search.trim());
    }
    if (e.key === "Escape") {
      setSearch(""); setServerSearch("");
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

  // Snooze action emits `googenie:refresh-inbox` so the snoozed thread
  // disappears from the list immediately.
  useEffect(() => {
    const handler = () => { void refetch(); };
    window.addEventListener("googenie:refresh-inbox", handler);
    return () => window.removeEventListener("googenie:refresh-inbox", handler);
  }, [refetch]);

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

  // NOTE: Feature/connection gates are intentionally placed AFTER all hooks
  // (further down, just before the main return) so the component renders the
  // same number of hooks on every render — required by the Rules of Hooks.
  // Returning early HERE would skip the useKeybinding calls below and trigger
  // "Rendered fewer hooks than expected" the moment the feature toggles off.

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
    drafts: null,
    sent: null,
  };
  // Source rows for filter+search depend on which folder is active.
  // Sent uses its own React Query source; drafts have a dedicated renderer
  // below and don't flow through `filtered` at all.
  const baseRows: EmailThread[] = filter === "sent" ? sentThreads : threads;
  const filtered = baseRows.filter((t) => {
    // Text search
    const searchOk = !search || t.subject.toLowerCase().includes(search.toLowerCase()) || t.snippet.toLowerCase().includes(search.toLowerCase()) || (t.from ?? "").toLowerCase().includes(search.toLowerCase());
    // Tab filter
    let filterOk: boolean;
    if (filter === "all" || filter === "sent") filterOk = true;
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
    filter === "reply_needed" ? replyOrdered : filtered;

  const unreadCount = threads.filter((t) => t.isUnread).length;

  // j/k navigation + Enter to open + Shift+S to toggle layout.
  // Note: these are declared AFTER displayList/setSelected so they can read
  // the latest state via closures captured each render.
  useKeybinding("inbox.nextThread", () => {
    if (displayList.length === 0) return;
    setFocusedIdx((cur) => {
      const next = Math.min((cur < 0 ? -1 : cur) + 1, displayList.length - 1);
      const t = displayList[next];
      if (t) openThread(t);
      return next;
    });
  });
  useKeybinding("inbox.prevThread", () => {
    if (displayList.length === 0) return;
    setFocusedIdx((cur) => {
      const next = Math.max((cur < 0 ? displayList.length : cur) - 1, 0);
      const t = displayList[next];
      if (t) openThread(t);
      return next;
    });
  });
  useKeybinding("inbox.openThread", () => {
    if (focusedIdx >= 0 && focusedIdx < displayList.length) {
      openThread(displayList[focusedIdx]);
    } else if (displayList[0]) {
      setFocusedIdx(0);
      openThread(displayList[0]);
    }
  });
  useKeybinding("inbox.toggleLayout", () => {
    if (!canSplitView) return;
    setLayout((cur) => (cur === "split" ? "stacked" : "split"));
  });

  // ── Gates (placed after all hooks to keep hook count stable) ──────────
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

  return (
    // Height = `100vh - 56px` (sticky header) and `-my-8` reclaims main's
    // `py-8` padding so the inbox fills from just below the header down to
    // the bottom of the viewport with no leftover whitespace.
    <div className="flex h-[calc(100vh-56px)] -mx-8 -my-8 overflow-hidden w-[calc(100%+4rem)] max-w-[calc(100%+4rem)]">
      {/* ── Thread list ── */}
      <div
        className={`flex flex-col shrink-0 min-w-0 ${layout === "stacked" ? "flex-1" : "w-[380px]"}`}
        style={{ background: "var(--c-surface-container-low)", borderRight: "1px solid var(--c-outline-variant)" }}
      >
        <div className="px-6 pt-4 pb-3">
          {/* Always-visible connection bar */}
          <ConnectionBar
            plugins={["gmail"]}
            status={connStatus}
            loading={connLoading}
            onConnected={() => { refreshConn(); refetch(); }}
          />
          {/* `flex-wrap` here so that in split mode (where the list column is
              only 380px wide) the action buttons drop to a second row instead
              of overflowing the column and spilling into the right pane. */}
          <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-headline text-2xl" style={{ color: "var(--c-on-surface)" }}>Inbox</h2>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold" style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}>{unreadCount}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {canSplitView && (
                <button
                  onClick={() => {
                    if (isNarrowViewport) return;
                    setLayout((cur) => (cur === "split" ? "stacked" : "split"));
                  }}
                  title={isNarrowViewport
                    ? "Split view needs a wider window. Resize to at least 1280px."
                    : `Switch to ${layout === "split" ? "stacked" : "split"} layout (Shift+S)`}
                  className="btn-ghost py-2 px-2 text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Toggle inbox layout"
                  disabled={isNarrowViewport}
                >
                  <Icon name={layout === "split" ? "splitscreen" : "view_agenda"} className="text-base" />
                  <span className="hidden sm:inline">{layout === "split" ? "Split" : "Stacked"}</span>
                </button>
              )}
              {hasFeature("ai_unsubscribe_sweep") && (
                <button
                  onClick={() => setUnsubOpen(true)}
                  title="Find newsletters and unsubscribe in one click"
                  className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5"
                >
                  <Icon name="cleaning_services" className="text-sm" />
                  Cleanup
                </button>
              )}
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
                { key: "all",          label: "All",          icon: "all_inbox",         requires: null },
                { key: "unread",       label: "Unread",       icon: "mark_email_unread", requires: null },
                { key: "reply_needed", label: "Reply needed", icon: "hourglass",         requires: "ai_reply_needed" },
                { key: "drafts",       label: "Drafts",       icon: "drafts",            requires: null },
                { key: "sent",         label: "Sent",         icon: "send",              requires: null },
                { key: "primary",      label: "Primary",      icon: "inbox",             requires: null },
                { key: "social",       label: "Social",       icon: "group",             requires: null },
                { key: "promotions",   label: "Promotions",   icon: "local_offer",       requires: null },
                { key: "updates",      label: "Updates",      icon: "info",              requires: null },
                { key: "forums",       label: "Forums",       icon: "forum",             requires: null },
              ] as const
            )
              .filter((f) => f.requires === null || hasFeature(f.requires))
              .map((f) => (
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
                    : f.key === "drafts" && drafts.length > 0
                      ? `${f.label} (${drafts.length})`
                      : f.label}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-base" style={{ color: "var(--c-outline)" }} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Search Gmail (live)…"
              className="pl-9 pr-20 py-2 rounded-xl text-sm w-full outline-none"
              style={{
                background: "var(--c-surface-container)",
                border: `1px solid ${serverSearch ? "var(--c-primary)" : "var(--c-outline-variant)"}`,
                color: "var(--c-on-surface)",
              }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {/* Live-search spinner: visible while the user is typing faster
                  than the 400ms debounce, or while the server search is
                  fetching results from Gmail/Corsair DB. */}
              {search && (loading || search.trim() !== serverSearch) && (
                <Icon name="progress_activity" className="text-base animate-spin" style={{ color: "var(--c-primary)" }} />
              )}
              {(search || serverSearch) && (
                <button
                  onClick={() => { setSearch(""); setServerSearch(""); }}
                  className="p-0.5"
                  style={{ color: "var(--c-outline)" }}
                  title="Clear"
                >
                  <Icon name="close" className="text-base" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Thread items */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {filter === "drafts" ? (
            <DraftsList
              drafts={drafts}
              loading={draftsQuery.isLoading}
              busyId={draftBusyId}
              onEdit={(d) => {
                setComposing(true);
                // ComposeModal opens blank; persist the editable draft via
                // a one-shot global so the modal can preload it without
                // changing its props contract (kept tiny for the POC).
                window.dispatchEvent(
                  new CustomEvent("googenie:compose-from-draft", { detail: d }),
                );
              }}
              onSend={async (d) => {
                setDraftBusyId(d.id);
                try {
                  await emailApi.sendDraft(d.id);
                  await qc.invalidateQueries({ queryKey: qk.emailDrafts() });
                  await qc.invalidateQueries({ queryKey: ["email", "sent"] });
                  await qc.invalidateQueries({ queryKey: ["email", "threads"] });
                  window.dispatchEvent(
                    new CustomEvent("googenie:toast", {
                      detail: { message: "Draft sent", kind: "success" },
                    }),
                  );
                } catch (e) {
                  window.dispatchEvent(
                    new CustomEvent("googenie:toast", {
                      detail: { message: (e as Error).message || "Failed to send draft", kind: "error" },
                    }),
                  );
                } finally {
                  setDraftBusyId(null);
                }
              }}
              onDelete={async (d) => {
                if (!confirm("Delete this draft?")) return;
                setDraftBusyId(d.id);
                try {
                  await emailApi.deleteDraft(d.id);
                  await qc.invalidateQueries({ queryKey: qk.emailDrafts() });
                } catch (e) {
                  window.dispatchEvent(
                    new CustomEvent("googenie:toast", {
                      detail: { message: (e as Error).message || "Failed to delete draft", kind: "error" },
                    }),
                  );
                } finally {
                  setDraftBusyId(null);
                }
              }}
            />
          ) : (
            <>
              {(filter === "sent" ? sentQuery.isLoading : loading) && <div className="flex items-center justify-center py-16"><Icon name="progress_activity" className="animate-spin text-3xl" style={{ color: "var(--c-primary)" }} /></div>}
              {error && <p className="text-sm px-4 py-8 text-center" style={{ color: "var(--c-error)" }}>{(error as Error).message}</p>}
              {!loading && displayList.length === 0 && !error && (
                <div className="px-4 py-8 text-center" style={{ color: "var(--c-on-surface-variant)" }}>
                  <p className="text-sm">
                    {search
                      ? `No results for "${search}"`
                      : filter === "unread"
                        ? "No unread emails"
                        : filter === "sent"
                          ? "Nothing in Sent yet"
                          : "No threads found"}
                  </p>
                  {search && (
                    <p className="text-xs mt-2 opacity-70">
                      Tip: Gmail-style operators work — try <code>from:</code>, <code>subject:</code>, <code>has:attachment</code>, or quoted phrases.
                    </p>
                  )}
                </div>
              )}
              {displayList.map((thread, idx) => {
            const isActive = selected?.id === thread.id;
            const isFocused = focusedIdx === idx && !isActive;
            const sim = thread.similarity;
            const urgency = thread.urgency;
            const daysWaiting = thread.daysWaiting;
            return (
              <button key={thread.id} onClick={() => { setFocusedIdx(idx); openThread(thread); }}
                className="w-full text-left p-4 rounded-xl transition-all duration-150 relative overflow-hidden"
                style={
                  isActive
                    ? { background: "var(--c-surface-container-high)", borderLeft: "3px solid var(--c-primary)", paddingLeft: "13px" }
                    : isFocused
                    ? { background: "color-mix(in srgb, var(--c-primary) 5%, transparent)", borderLeft: "3px solid color-mix(in srgb, var(--c-primary) 40%, transparent)", paddingLeft: "13px" }
                    : { borderLeft: "3px solid transparent" }
                }>
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
            </>
          )}
        </div>
      </div>

      {/* ── Thread detail ── */}
      {/* In SPLIT layout: always show the right pane (selected thread or empty
          state with digest panels). In STACKED layout: only show the right pane
          when a thread is selected, and overlay it across the full window. */}
      {layout === "split" ? (
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
                {/* Feature: daily_digest — "what's on my plate" */}
                {hasFeature("daily_digest") && <DigestPanel />}

                {/* Feature B5 — Daily gaps banner */}
                {hasFeature("ai_daily_gaps") && <DailyGapsBanner />}

                {/* Feature C1 — Email-to-task extractor */}
                {hasFeature("ai_task_extractor") && <TasksPanel />}

                {/* Feature B4 — Follow-up tracker card */}
                {hasFeature("ai_follow_up_tracker") && <FollowUpCard />}

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
      ) : (
        // Stacked layout: thread pane overlays the list when one is open.
        selected && (
          <div
            className="fixed inset-0 z-40 flex"
            style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
            onClick={() => setSelected(null)}
          >
            <div
              className="ml-auto h-full w-full max-w-3xl flex flex-col shadow-2xl"
              style={{ background: "var(--c-background)", borderLeft: "1px solid var(--c-outline-variant)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <ThreadPane
                thread={selected}
                onClose={() => setSelected(null)}
                onMarkRead={markLocalRead}
                onTrash={(id) => trashMut.mutate(id)}
                canWrite={canWrite}
                canSummarize={hasFeature("ai_summary")}
                canAiCompose={canWrite && hasFeature("ai_compose")}
              />
            </div>
          </div>
        )
      )}

      {composing && <ComposeModal onClose={() => { setComposing(false); refetch(); }} canAiCompose={canWrite && hasFeature("ai_compose")} />}
      {unsubOpen && <UnsubscribeSweepModal onClose={() => setUnsubOpen(false)} />}
    </div>
  );
}

// ── Drafts folder renderer ────────────────────────────────────────────────────
//
// Lives inline so it can share Inbox-style row chrome (rounded button, left
// rule on hover) without exporting another file. Each row shows recipient +
// subject + snippet plus inline Send / Delete actions; clicking the body
// fires an `onEdit` so the parent can reopen the compose modal preloaded
// with the draft.
function DraftsList(props: {
  drafts: DraftSummary[];
  loading: boolean;
  busyId: string | null;
  onEdit: (d: DraftSummary) => void;
  onSend: (d: DraftSummary) => void;
  onDelete: (d: DraftSummary) => void;
}) {
  const { drafts, loading, busyId, onEdit, onSend, onDelete } = props;
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icon name="progress_activity" className="animate-spin text-3xl" style={{ color: "var(--c-primary)" }} />
      </div>
    );
  }
  if (drafts.length === 0) {
    return (
      <div className="px-4 py-10 text-center" style={{ color: "var(--c-on-surface-variant)" }}>
        <Icon name="drafts" className="text-3xl mb-2" style={{ opacity: 0.4 }} />
        <p className="text-sm">No drafts saved</p>
        <p className="text-xs mt-1 opacity-70">Compose an email and close without sending to save a draft.</p>
      </div>
    );
  }
  return (
    <>
      {drafts.map((d) => {
        const busy = busyId === d.id;
        return (
          <div
            key={d.id}
            className="w-full text-left p-4 rounded-xl transition-all duration-150 relative overflow-hidden group"
            style={{ borderLeft: "3px solid transparent" }}
          >
            <button
              type="button"
              onClick={() => onEdit(d)}
              className="w-full text-left"
              disabled={busy}
            >
              <div className="flex items-start justify-between gap-2 mb-1 pr-2">
                <span className="text-xs truncate font-medium" style={{ color: "var(--c-on-surface-variant)" }}>
                  {d.to || "(no recipient)"}
                </span>
                <span className="text-[11px] shrink-0 flex items-center gap-1.5" style={{ color: "var(--c-on-surface-variant)" }}>
                  <span
                    className="px-1 rounded text-[9px] font-bold uppercase"
                    style={{ background: "color-mix(in srgb, var(--c-tertiary) 18%, transparent)", color: "var(--c-tertiary)" }}
                  >
                    Draft
                  </span>
                  {new Date(d.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm truncate font-semibold" style={{ color: "var(--c-on-surface)" }}>
                {d.subject || "(no subject)"}
              </p>
              <p className="text-xs truncate mt-0.5" style={{ color: "var(--c-on-surface-variant)" }}>
                {d.snippet || "Empty body — click to edit"}
              </p>
            </button>
            <div className="flex items-center gap-1.5 mt-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSend(d); }}
                disabled={busy || !d.to}
                title={d.to ? "Send this draft now" : "Add a recipient first"}
                className="btn-primary py-1 px-2.5 text-[11px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name={busy ? "progress_activity" : "send"} className={`text-[12px] ${busy ? "animate-spin" : ""}`} />
                Send
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(d); }}
                disabled={busy}
                title="Delete this draft"
                className="btn-ghost py-1 px-2 text-[11px] flex items-center gap-1 disabled:opacity-40"
              >
                <Icon name="delete" className="text-[12px]" />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
