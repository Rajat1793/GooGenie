"use client";

/**
 * Floating AI agent chat bar.
 *
 * Renders bottom-right of the app shell. Click to open a small command-palette
 * style drawer where the user can type natural-language requests like
 *   - "summarise my latest unread email"
 *   - "schedule 30 min with priya next week"
 *   - "find emails about Q3 budget"
 *
 * Sends to POST /v1/agent/execute (LLM tool-calling). Responses display
 * action/message/suggestions returned from the backend.
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "../lib/router-shim";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { aiApi, type AgentResponse } from "../api/client";
import { useFeatures } from "../contexts/FeatureContext";
import { getErrorMessage } from "../lib/errors";
import { Icon } from "../components/Icon";
import { useKeybinding, useKeybindings, getEffectiveCombo, formatCombo } from "../contexts/KeybindingContext";

export function AgentBar() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ user: string; reply: AgentResponse }>>([]);
  const [statusIdx, setStatusIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { hasFeature } = useFeatures();
  const navigate = useNavigate();

  // Quirky rotating "thinking…" labels. Cycled while a request is in flight
  // so the user gets a sense of progress instead of a static dot.
  const STATUS_MESSAGES = [
    "🪙 Mining the inbox for gold…",
    "🗓️ Digging up your calendar…",
    "🔮 Consulting the AI oracle…",
    "📬 Wrangling Gmail threads…",
    "🤝 Negotiating with Google APIs…",
    "✨ Summoning calendar events…",
    "🧠 Untangling thread context…",
    "⚡ Charging the agent's batteries…",
    "🪄 Sprinkling AI on your inbox…",
    "🛰️ Pinging the Corsair connector…",
  ];

  // Strip the hidden two-phase-commit marker from displayed messages.
  // The marker is kept in `h.reply.message` so it round-trips back to the
  // server as conversation memory (where it's parsed for confirmation).
  function displayMessage(raw: string): string {
    return raw.replace(/<!--GOOGENIE_PENDING\s+[\s\S]+?-->/g, "").trim();
  }

  function openEmailRef(threadId: string) {
    setOpen(false);
    navigate(`/inbox?thread=${encodeURIComponent(threadId)}`);
  }

  // Map a suggestion chip to a starter-template prompt the user can edit
  // before sending. Some templates end with a trailing space so the cursor
  // lands at the end ready for input.
  function suggestionToTemplate(s: string): string {
    const k = s.toLowerCase();
    if (k.includes("confirm") && k.includes("create")) return "Yes, create the event";
    if (k.includes("confirm") && k.includes("send")) return "Yes, send the email";
    if (k.includes("schedule anyway")) return "Schedule it anyway";
    if (k.includes("different time") || k === "change time") return "Change the time to ";
    if (k.includes("free slots")) return "Show me my free slots ";
    if (k.includes("attendees")) return "Add attendees: ";
    if (k.includes("edit body")) return "Edit the body: ";
    if (k.includes("tone")) return "Use a friendlier tone";
    return s;
  }

  function applySuggestion(s: string) {
    const tpl = suggestionToTemplate(s);
    setPrompt(tpl);
    // Defer focus so the value is in place before we move the caret to the end.
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const end = tpl.length;
      try { el.setSelectionRange(end, end); } catch { /* noop */ }
    }, 0);
  }

  // Toggle via the keybinding system (default ⌘K; user can rebind).
  useKeybinding("agent.toggle", () => setOpen((o) => !o));
  const { bindings } = useKeybindings();
  const agentCombo = formatCombo(getEffectiveCombo(bindings, "agent.toggle"));

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Click outside closes
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Cycle quirky status messages while a request is in flight.
  useEffect(() => {
    if (!busy) return;
    setStatusIdx(Math.floor(Math.random() * STATUS_MESSAGES.length));
    const id = window.setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 1400);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // Hide entirely if user has no AI features at all
  if (!hasFeature("ai_summary") && !hasFeature("ai_compose") && !hasFeature("email_read")) {
    return null;
  }

  async function send() {
    const q = prompt.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      // Build conversation history (memory) from previous turns — last 10 to stay in context window
      const memory: Array<{ role: "user" | "assistant"; content: string }> = [];
      for (const h of history.slice(-5)) {
        memory.push({ role: "user", content: h.user });
        if (h.reply.message) memory.push({ role: "assistant", content: h.reply.message });
      }
      const reply = await aiApi.agent(q, memory);
      setHistory((h) => [...h, { user: q, reply }]);
      setPrompt("");
    } catch (err) {
      setHistory((h) => [
        ...h,
        {
          user: q,
          reply: {
            action: "error",
            message: getErrorMessage(err, "Agent request failed"),
            suggestions: [],
            ai_available: false,
          },
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function clearConversation() {
    setHistory([]);
    setPrompt("");
    inputRef.current?.focus();
  }

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Open AI agent (${agentCombo})`}
          className="fixed bottom-6 right-6 z-[200] flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl text-sm font-semibold transition-transform hover:scale-105"
          style={{
            background: "linear-gradient(135deg, var(--c-primary), var(--c-tertiary))",
            color: "var(--c-on-primary)",
          }}
        >
          <span className="text-base">✨</span>
          <span>Ask GooGenie</span>
          <kbd
            className="ml-1 hidden sm:inline-block px-1.5 py-0.5 text-[10px] rounded font-mono"
            style={{ background: "rgba(255,255,255,0.25)" }}
          >
            {agentCombo}
          </kbd>
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6 pointer-events-none">
          <div
            ref={drawerRef}
            className="w-full sm:w-[420px] max-h-[70vh] flex flex-col rounded-2xl shadow-2xl pointer-events-auto"
            style={{
              background: "var(--c-surface-container-high)",
              border: "1px solid var(--c-outline-variant)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "var(--c-outline-variant)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">✨</span>
                <span className="font-semibold text-sm" style={{ color: "var(--c-on-surface)" }}>
                  GooGenie Assistant
                </span>
                {history.length > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: "var(--c-tertiary-container)", color: "var(--c-on-tertiary-container)" }}
                    title="Conversation memory active"
                  >
                    {history.length} {history.length === 1 ? "turn" : "turns"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {history.length > 0 && (
                  <button
                    onClick={clearConversation}
                    className="text-xs px-2 py-1 rounded hover:opacity-70 flex items-center gap-1"
                    style={{ color: "var(--c-on-surface-variant)" }}
                    title="Clear conversation memory"
                  >
                    <Icon name="refresh" className="text-sm" />
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs px-2 py-1 rounded hover:opacity-70"
                  style={{ color: "var(--c-on-surface-variant)" }}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Conversation */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
              {history.length === 0 && (
                <div
                  className="rounded-xl p-3 text-xs space-y-2"
                  style={{
                    background: "var(--c-surface-container)",
                    color: "var(--c-on-surface-variant)",
                  }}
                >
                  <div className="font-medium" style={{ color: "var(--c-on-surface)" }}>
                    Hi! I help with your email & calendar only.
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    I can summarize threads, draft replies, find emails, and schedule events.
                    I won't answer general questions outside this workspace.
                  </p>
                  <div className="font-medium pt-1" style={{ color: "var(--c-on-surface)" }}>
                    Try asking…
                  </div>
                  {[
                    "Summarise my latest unread email",
                    "Find emails about budget",
                    "Schedule 30 min with the team next week",
                    "Draft a friendly thank-you reply",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setPrompt(s)}
                      className="block w-full text-left px-2 py-1 rounded hover:bg-black/5 transition"
                    >
                      {s}
                    </button>
                  ))}
                  <p className="text-[10px] pt-1 italic flex items-center gap-1" style={{ color: "var(--c-primary)" }}>
                    <Icon name="arrow_downward" className="text-xs" />
                    Type your request in the box below
                  </p>
                </div>
              )}
              {history.map((h, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="text-right">
                    <div
                      className="inline-block max-w-[85%] rounded-2xl px-3 py-2"
                      style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
                    >
                      {h.user}
                    </div>
                  </div>
                  <div>
                    <div
                      className="inline-block max-w-[90%] rounded-2xl px-3 py-2 whitespace-pre-wrap"
                      style={{
                        background: "var(--c-surface-container)",
                        color: "var(--c-on-surface)",
                      }}
                    >
                      {displayMessage(h.reply.message) || "(no response)"}
                      {h.reply.email_refs && h.reply.email_refs.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {h.reply.email_refs.map((ref) => (
                            <button
                              key={ref.thread_id}
                              onClick={() => openEmailRef(ref.thread_id)}
                              className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-lg text-[11px] transition hover:opacity-90 group"
                              style={{
                                background: "var(--c-primary-container)",
                                color: "var(--c-on-primary-container)",
                                border: "1px solid var(--c-outline-variant)",
                              }}
                              title="Open this email in the inbox"
                            >
                              <Icon name="mail" className="text-sm shrink-0 mt-0.5" />
                              <span className="flex-1 min-w-0">
                                <span className="block font-semibold truncate">{ref.subject || "(no subject)"}</span>
                                {ref.from && <span className="block opacity-70 truncate">{ref.from}</span>}
                              </span>
                              <Icon name="open_in_new" className="text-sm opacity-60 group-hover:opacity-100 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                      {h.reply.suggestions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {h.reply.suggestions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => applySuggestion(s)}
                              className="text-[10px] px-2 py-0.5 rounded-full transition hover:scale-105 active:scale-95 cursor-pointer"
                              style={{
                                background: "var(--c-tertiary-container)",
                                color: "var(--c-on-tertiary-container)",
                                border: "1px solid var(--c-outline-variant)",
                              }}
                              title={`Use "${s}" as a starter — you can edit before sending`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      {!h.reply.ai_available && (
                        <div className="mt-1 text-[10px] opacity-60">
                          AI unavailable — keyword fallback in use
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {busy && (
                <div
                  className="text-xs italic flex items-center gap-2"
                  style={{ color: "var(--c-on-surface-variant)" }}
                  aria-live="polite"
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: "var(--c-primary)" }}
                  />
                  <span key={statusIdx} className="googenie-status-fade">
                    {STATUS_MESSAGES[statusIdx]}
                  </span>
                </div>
              )}
            </div>

            {/* Input */}
            <div
              className="px-3 py-3 border-t flex gap-2"
              style={{ borderColor: "var(--c-outline-variant)" }}
            >
              <input
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Ask about your email or calendar…"
                className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: "var(--c-surface-container-lowest)",
                  color: "var(--c-on-surface)",
                  border: "1px solid var(--c-outline-variant)",
                }}
                disabled={busy}
              />
              <button
                onClick={() => void send()}
                disabled={busy || !prompt.trim()}
                className="px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
                style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
