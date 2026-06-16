"use client";

/**
 * CommandPalette — universal ⌘K palette with four modes:
 *   • Ask AI      → free-form prompt → POST /v1/agent/execute
 *   • Commands    → fuzzy list of every registered KeybindingAction
 *   • People      → fuzzy search of distinct senders in your inbox
 *   • Threads     → fuzzy search of recent thread subjects
 *
 * Mode prefixes in the input let power users skip the tab row:
 *   ">"  Commands
 *   "@"  People
 *   "#"  Threads
 *   (otherwise the active tab is used; default = Ask AI)
 *
 * Arrow keys navigate the results, Enter executes, Esc closes.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  KEYBINDINGS,
  formatCombo,
  getEffectiveCombo,
  useKeybinding,
  useKeybindings,
  type KeybindingAction,
} from "../contexts/KeybindingContext";
import { aiApi, emailApi, type EmailThread, type AgentResponse } from "../api/client";
import { Icon } from "./Icon";

type Mode = "ai" | "commands" | "people" | "threads";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon?: string;
  onSelect: () => void;
}

const MODE_LABEL: Record<Mode, string> = {
  ai: "Ask GooGenie",
  commands: "Commands",
  people: "People",
  threads: "Threads",
};

const MODE_PREFIX: Array<{ prefix: string; mode: Mode }> = [
  { prefix: ">", mode: "commands" },
  { prefix: "@", mode: "people" },
  { prefix: "#", mode: "threads" },
];

function fuzzyMatches(needle: string, hay: string): boolean {
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  if (!n) return true;
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i += 1;
    if (i === n.length) return true;
  }
  return h.includes(n);
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("ai");
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Threads cache (loaded lazily on first open).
  const [threads, setThreads] = useState<EmailThread[] | null>(null);
  // AI response state.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReply, setAiReply] = useState<AgentResponse | null>(null);

  const { bindings, trigger } = useKeybindings();

  useKeybinding("palette.toggle", () => setOpen((o) => !o));

  // Reset state on close.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIdx(0);
      setAiReply(null);
      setMode("ai");
    } else {
      setTimeout(() => inputRef.current?.focus(), 50);
      // Warm threads cache.
      if (threads === null) {
        emailApi
          .listThreads({ limit: 50 })
          .then((r) => setThreads(r.threads))
          .catch(() => setThreads([]));
      }
    }
  }, [open, threads]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Detect mode prefix on every query change.
  const effectiveMode: Mode = useMemo(() => {
    const trimmed = query.trimStart();
    for (const { prefix, mode: m } of MODE_PREFIX) {
      if (trimmed.startsWith(prefix)) return m;
    }
    return mode;
  }, [query, mode]);

  const cleanQuery = useMemo(() => {
    const trimmed = query.trimStart();
    for (const { prefix } of MODE_PREFIX) {
      if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length).trimStart();
    }
    return trimmed;
  }, [query]);

  const close = useCallback(() => setOpen(false), []);

  // Build the items for the active mode.
  const items: CommandItem[] = useMemo(() => {
    if (effectiveMode === "commands") {
      return KEYBINDINGS.filter((k) => fuzzyMatches(cleanQuery, k.label))
        .map<CommandItem>((def) => ({
          id: def.id,
          label: def.label,
          hint: formatCombo(getEffectiveCombo(bindings, def.id)),
          icon: "keyboard",
          onSelect: () => {
            close();
            // Defer so the palette unmounts first (some actions open modals).
            setTimeout(() => trigger(def.id as KeybindingAction), 0);
          },
        }));
    }
    if (effectiveMode === "people") {
      const senders = new Map<string, { email: string; name: string; threadId: string; subject: string }>();
      for (const t of threads ?? []) {
        if (!t.from) continue;
        const key = t.from.toLowerCase();
        if (!senders.has(key)) {
          // Strip "Name <email>" → just the name part when present.
          const match = /^(.*?)\s*<([^>]+)>\s*$/.exec(t.from);
          senders.set(key, {
            email: match ? match[2] : t.from,
            name: match ? match[1] || match[2] : t.from,
            threadId: t.id,
            subject: t.subject,
          });
        }
      }
      return [...senders.values()]
        .filter((p) => fuzzyMatches(cleanQuery, `${p.name} ${p.email}`))
        .slice(0, 20)
        .map<CommandItem>((p) => ({
          id: p.email,
          label: p.name,
          hint: p.email,
          icon: "person",
          onSelect: () => {
            close();
            router.push(`/inbox?q=${encodeURIComponent(p.email)}`);
          },
        }));
    }
    if (effectiveMode === "threads") {
      return (threads ?? [])
        .filter((t) => fuzzyMatches(cleanQuery, `${t.subject} ${t.from}`))
        .slice(0, 20)
        .map<CommandItem>((t) => ({
          id: t.id,
          label: t.subject || "(no subject)",
          hint: t.from,
          icon: "mail",
          onSelect: () => {
            close();
            router.push(`/inbox?thread=${encodeURIComponent(t.id)}`);
          },
        }));
    }
    // Ask AI: a single primary action that submits.
    if (!cleanQuery.trim()) return [];
    return [
      {
        id: "ai-submit",
        label: `Ask: "${cleanQuery}"`,
        hint: "Enter",
        icon: "auto_awesome",
        onSelect: () => void askAi(),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMode, cleanQuery, bindings, threads]);

  // Reset selection when items change.
  useEffect(() => { setActiveIdx(0); }, [items.length, effectiveMode]);

  async function askAi() {
    const prompt = cleanQuery.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true);
    setAiReply(null);
    try {
      const r = await aiApi.agent(prompt);
      setAiReply(r);
    } catch {
      setAiReply({
        action: "error",
        message: "Couldn't reach the agent — try again.",
        suggestions: [],
        ai_available: false,
      });
    } finally {
      setAiBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (effectiveMode === "ai") {
        void askAi();
      } else if (items[activeIdx]) {
        items[activeIdx].onSelect();
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const order: Mode[] = ["ai", "commands", "people", "threads"];
      const idx = order.indexOf(effectiveMode);
      const next = order[(idx + (e.shiftKey ? -1 + order.length : 1)) % order.length];
      setMode(next);
      setQuery("");
    }
  }

  // Scroll active item into view.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  const displayMessage = (raw: string) => raw.replace(/<!--GOOGENIE_PENDING\s+[\s\S]+?-->/g, "").trim();

  return (
    <div
      className="fixed inset-0 z-[280] flex items-start justify-center pt-[10vh] p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          background: "var(--c-surface-container-high)",
          border: "1px solid var(--c-outline-variant)",
          maxHeight: "70vh",
        }}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--c-outline-variant)" }}>
          <Icon
            name={effectiveMode === "ai" ? "auto_awesome" : effectiveMode === "people" ? "person" : effectiveMode === "threads" ? "mail" : "keyboard"}
            className="text-lg"
            style={{ color: "var(--c-primary)" }}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              effectiveMode === "ai"
                ? "Ask GooGenie about your email or calendar…  (> for commands, @ people, # threads, Tab to switch)"
                : effectiveMode === "commands"
                ? "Run a command…"
                : effectiveMode === "people"
                ? "Find a sender…"
                : "Find a thread…"
            }
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--c-on-surface)" }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: "var(--c-surface-container)", color: "var(--c-on-surface-variant)" }}>
            esc
          </kbd>
        </div>

        {/* Tab row */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b" style={{ borderColor: "var(--c-outline-variant)" }}>
          {(["ai", "commands", "people", "threads"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setQuery(""); inputRef.current?.focus(); }}
              className="text-[11px] px-2.5 py-1 rounded-full font-medium transition"
              style={effectiveMode === m
                ? { background: "var(--c-primary)", color: "var(--c-on-primary)" }
                : { background: "transparent", color: "var(--c-on-surface-variant)" }
              }
            >
              {MODE_LABEL[m]}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-[10px]" style={{ color: "var(--c-outline)" }}>Tab to switch</span>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-2">
          {effectiveMode === "ai" && aiBusy && (
            <div className="text-xs italic px-3 py-3" style={{ color: "var(--c-on-surface-variant)" }}>
              ✨ Thinking…
            </div>
          )}
          {effectiveMode === "ai" && aiReply && (
            <div className="px-3 py-3 space-y-2">
              <div
                className="text-sm whitespace-pre-wrap rounded-xl px-3 py-2"
                style={{ background: "var(--c-surface-container)", color: "var(--c-on-surface)" }}
              >
                {displayMessage(aiReply.message) || "(no response)"}
              </div>
              {aiReply.email_refs && aiReply.email_refs.length > 0 && (
                <div className="space-y-1">
                  {aiReply.email_refs.map((ref) => (
                    <button
                      key={ref.thread_id}
                      onClick={() => { close(); router.push(`/inbox?thread=${encodeURIComponent(ref.thread_id)}`); }}
                      className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-lg text-[11px] hover:opacity-90"
                      style={{ background: "var(--c-primary-container)", color: "var(--c-on-primary-container)" }}
                    >
                      <Icon name="mail" className="text-sm shrink-0 mt-0.5" />
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate">{ref.subject || "(no subject)"}</span>
                        {ref.from && <span className="block opacity-70 truncate">{ref.from}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {items.length === 0 && !aiBusy && !aiReply && (
            <div className="text-xs px-3 py-4 text-center" style={{ color: "var(--c-on-surface-variant)" }}>
              {effectiveMode === "ai"
                ? "Type a question and hit Enter to ask GooGenie."
                : effectiveMode === "people" || effectiveMode === "threads"
                ? threads === null
                  ? "Loading…"
                  : "No matches."
                : "No matching commands."}
            </div>
          )}
          {items.map((item, idx) => (
            <button
              key={item.id}
              data-idx={idx}
              onClick={item.onSelect}
              onMouseEnter={() => setActiveIdx(idx)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition"
              style={{
                background: idx === activeIdx ? "var(--c-secondary-container)" : "transparent",
                color: idx === activeIdx ? "var(--c-on-secondary-container)" : "var(--c-on-surface)",
              }}
            >
              {item.icon && <Icon name={item.icon} className="text-base shrink-0" />}
              <span className="flex-1 min-w-0 truncate text-sm">{item.label}</span>
              {item.hint && (
                <span className="text-[11px] opacity-70 shrink-0 truncate max-w-[40%] text-right" style={{ color: "var(--c-on-surface-variant)" }}>
                  {item.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
