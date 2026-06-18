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
import { aiApi, type AgentResponse } from "../api/client";
import { useFeatures } from "../contexts/FeatureContext";
import { getErrorMessage } from "../lib/errors";
import { Icon } from "../components/Icon";
import { AssistantMarkdown } from "../components/AssistantMarkdown";
import { useKeybinding, useKeybindings, getEffectiveCombo, formatCombo } from "../contexts/KeybindingContext";

export function AgentBar() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ user: string; reply: AgentResponse }>>([]);
  // Index of the currently active "thinking phase" while a request is in
  // flight. Phases are time-gated below; this mirrors Claude's UX of
  // surfacing each step (Thinking → Reading → Analyzing → Composing
  // → Finalizing) so the wait feels like deliberate work, not a frozen
  // spinner.
  const [phaseIdx, setPhaseIdx] = useState(0);
  const phaseStartRef = useRef<number>(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const { hasFeature } = useFeatures();
  const navigate = useNavigate();

  // Claude-style thinking trace. Each phase becomes active once the
  // elapsed time since the request started passes `at` (ms). The last
  // phase stays active until the network response actually arrives, at
  // which point the entire trace is replaced by the assistant message.
  const THINKING_PHASES: Array<{ at: number; label: string; icon: string }> = [
    { at: 0,    label: "Thinking",            icon: "auto_awesome" },
    { at: 700,  label: "Reading your inbox",  icon: "mail" },
    { at: 1900, label: "Analyzing context",   icon: "search" },
    { at: 3600, label: "Composing response",  icon: "edit_note" },
    { at: 6500, label: "Finalizing",          icon: "check" },
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
    if (k.includes("send to")) return "Send it to ";
    if (k.includes("edit body")) return "Edit the body: ";
    if (k.includes("tone")) return "Use a friendlier tone";
    return s;
  }

  // Map nav-style chips to a destination route. Returning a path means we
  // should navigate immediately on click (and close the drawer) instead of
  // round-tripping the chip text through the LLM, which would just refuse
  // because "Open Inbox" isn't an email/calendar intent.
  function suggestionToRoute(s: string): string | null {
    const k = s.toLowerCase().trim();
    if (k === "open inbox" || k === "check inbox" || k === "view inbox") return "/inbox";
    if (k === "compose another" || k === "open compose" || k === "compose") return "/inbox?compose=1";
    if (k === "view calendar" || k === "go to calendar" || k === "open calendar") return "/calendar";
    if (k === "schedule another") return "/calendar";
    if (k === "reconnect gmail" || k === "connect gmail") return "/profile";
    return null;
  }

  function applySuggestion(s: string) {
    // Nav-style chips: navigate directly instead of filling the prompt.
    const route = suggestionToRoute(s);
    if (route) {
      setOpen(false);
      navigate(route);
      return;
    }
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

  // External controllers (sidebar nav item, etc.) trigger open/close via a
  // window event so they don't have to share React state with the FAB-less
  // AgentBar mounted at the bottom of <Shell>.
  useEffect(() => {
    function onToggle(e: Event) {
      const detail = (e as CustomEvent<{ open?: boolean } | undefined>).detail;
      if (typeof detail?.open === "boolean") setOpen(detail.open);
      else setOpen((o) => !o);
    }
    window.addEventListener("googenie:agent.toggle", onToggle);
    return () => window.removeEventListener("googenie:agent.toggle", onToggle);
  }, []);

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

  // Auto-scroll the conversation to the latest message whenever new history
  // is added or the assistant is mid-response. ChatGPT does the same so the
  // newest turn is always visible above the input bar.
  useEffect(() => {
    if (!open) return;
    const el = conversationRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, busy, open]);

  // Auto-grow the textarea up to a cap so long prompts wrap visibly.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt, open]);

  // Advance the Claude-style thinking trace while a request is in flight.
  // We tick every 200 ms and resolve the latest phase whose `at` threshold
  // has elapsed. When `busy` flips back to false we reset to 0 so the next
  // turn starts clean.
  useEffect(() => {
    if (!busy) {
      setPhaseIdx(0);
      return;
    }
    phaseStartRef.current = Date.now();
    setPhaseIdx(0);
    const id = window.setInterval(() => {
      const elapsed = Date.now() - phaseStartRef.current;
      let next = 0;
      for (let i = 0; i < THINKING_PHASES.length; i++) {
        if (elapsed >= THINKING_PHASES[i].at) next = i;
      }
      setPhaseIdx(next);
    }, 200);
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

  if (!open) return null;

  const STARTER_PROMPTS = [
    { icon: "summarize", title: "Summarize my inbox", prompt: "Summarise my latest unread emails." },
    { icon: "search", title: "Find an email", prompt: "Find emails about " },
    { icon: "edit_note", title: "Draft a reply", prompt: "Draft a friendly thank-you reply to " },
    { icon: "event", title: "Schedule a meeting", prompt: "Schedule 30 min with the team next week" },
  ];

  return (
    <div
      className="fixed inset-0 z-[250] flex items-stretch justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="GooGenie Assistant"
    >
      {/* Backdrop — click to close */}
      <div
        onClick={() => setOpen(false)}
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--c-scrim, #000) 55%, transparent)", backdropFilter: "blur(2px)" }}
      />

      {/* Centered chat surface — ChatGPT-style: full-height column with the
          conversation scrolling above a pinned composer at the bottom. */}
      <div
        ref={drawerRef}
        className="relative flex flex-col w-full max-w-3xl mx-auto my-0 sm:my-6 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: "var(--c-surface-container-lowest)",
          border: "1px solid var(--c-outline-variant)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: "var(--c-outline-variant)", background: "var(--c-surface-container-low)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, var(--c-primary), var(--c-tertiary))" }}
            >
              <span className="text-base">✨</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-sm" style={{ color: "var(--c-on-surface)" }}>
                GooGenie Assistant
              </span>
              <span className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>
                {history.length === 0
                  ? "Email & calendar copilot"
                  : `${history.length} ${history.length === 1 ? "turn" : "turns"} in this chat`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {history.length > 0 && (
              <button
                onClick={clearConversation}
                className="text-xs px-2.5 py-1.5 rounded-lg hover:bg-black/5 flex items-center gap-1"
                style={{ color: "var(--c-on-surface-variant)" }}
                title="Start a new chat"
              >
                <Icon name="add" className="text-sm" />
                New chat
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-black/5"
              style={{ color: "var(--c-on-surface-variant)" }}
              title={`Close (${agentCombo} to reopen)`}
            >
              <Icon name="close" className="text-base" />
            </button>
          </div>
        </div>

        {/* Conversation list */}
        <div
          ref={conversationRef}
          className="flex-1 overflow-y-auto"
          style={{ background: "var(--c-surface-container-lowest)" }}
        >
          {history.length === 0 ? (
            <div className="min-h-full flex items-center justify-center px-4 sm:px-6 py-8">
              <div className="w-full max-w-2xl text-center">
                <div
                  className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 shadow-sm"
                  style={{ background: "linear-gradient(135deg, var(--c-primary), var(--c-tertiary))" }}
                >
                  <span className="text-2xl">✨</span>
                </div>
                <h2
                  className="text-[22px] sm:text-2xl font-semibold mb-2 tracking-tight"
                  style={{ color: "var(--c-on-surface)" }}
                >
                  How can I help with your inbox today?
                </h2>
                <p className="text-sm mb-8 mx-auto max-w-md" style={{ color: "var(--c-on-surface-variant)" }}>
                  Summarize threads, draft replies, find emails, and schedule meetings — I stay focused on your mail &amp; calendar.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                  {STARTER_PROMPTS.map((s) => (
                    <button
                      key={s.title}
                      onClick={() => {
                        setPrompt(s.prompt);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="group flex items-start gap-3 p-3.5 rounded-xl border text-left transition hover:shadow-md hover:-translate-y-0.5"
                      style={{
                        background: "var(--c-surface-container)",
                        borderColor: "var(--c-outline-variant)",
                      }}
                    >
                      <span
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition group-hover:scale-105"
                        style={{
                          background: "color-mix(in srgb, var(--c-primary) 12%, transparent)",
                          color: "var(--c-primary)",
                        }}
                      >
                        <Icon name={s.icon} size={18} />
                      </span>
                      <span className="flex flex-col min-w-0 flex-1 leading-snug">
                        <span className="text-sm font-semibold truncate" style={{ color: "var(--c-on-surface)" }}>
                          {s.title}
                        </span>
                        <span
                          className="text-xs mt-0.5 line-clamp-2"
                          style={{ color: "var(--c-on-surface-variant)" }}
                        >
                          {s.prompt.trim() || "Tap to start"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
              {history.map((h, i) => (
                <div key={i} className="space-y-4">
                  {/* User message row */}
                  <div className="flex items-start gap-3 justify-end">
                    <div
                      className="rounded-2xl px-4 py-2.5 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
                    >
                      {h.user}
                    </div>
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-semibold"
                      style={{ background: "var(--c-surface-container-high)", color: "var(--c-on-surface)" }}
                    >
                      <Icon name="person" className="text-base" />
                    </div>
                  </div>

                  {/* Assistant message row */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: "linear-gradient(135deg, var(--c-primary), var(--c-tertiary))" }}
                    >
                      <span className="text-xs">✨</span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div
                        className="rounded-2xl px-4 py-3"
                        style={{
                          background: "var(--c-surface-container)",
                          color: "var(--c-on-surface)",
                        }}
                      >
                        {(() => {
                          const msg = displayMessage(h.reply.message);
                          return msg
                            ? <AssistantMarkdown text={msg} />
                            : <span className="text-sm italic opacity-70">(no response)</span>;
                        })()}
                      </div>
                      {h.reply.email_refs && h.reply.email_refs.length > 0 && (
                        <div className="space-y-1.5">
                          {h.reply.email_refs.map((ref) => (
                            <button
                              key={ref.thread_id}
                              onClick={() => openEmailRef(ref.thread_id)}
                              className="w-full text-left flex items-start gap-2 px-3 py-2 rounded-xl text-xs transition hover:opacity-90 group"
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
                        <div className="flex flex-wrap gap-1.5">
                          {h.reply.suggestions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => applySuggestion(s)}
                              className="text-[11px] px-2.5 py-1 rounded-full transition hover:scale-105 active:scale-95 cursor-pointer"
                              style={{
                                background: "var(--c-tertiary-container)",
                                color: "var(--c-on-tertiary-container)",
                                border: "1px solid var(--c-outline-variant)",
                              }}
                              title={`Use "${s}"`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      {!h.reply.ai_available && (
                        <div className="text-[10px] opacity-60" style={{ color: "var(--c-on-surface-variant)" }}>
                          AI unavailable — keyword fallback in use
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex items-start gap-3" aria-live="polite">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "linear-gradient(135deg, var(--c-primary), var(--c-tertiary))" }}
                  >
                    <span className="text-xs">✨</span>
                  </div>
                  <div
                    className="rounded-2xl px-4 py-3 space-y-1.5 min-w-0"
                    style={{
                      background: "var(--c-surface-container)",
                      border: "1px solid var(--c-outline-variant)",
                    }}
                  >
                    {THINKING_PHASES.slice(0, phaseIdx + 1).map((p, i) => {
                      const done = i < phaseIdx;
                      const active = i === phaseIdx;
                      return (
                        <div
                          key={p.label}
                          className="googenie-trace-line flex items-center gap-2 text-xs"
                        >
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                            style={{
                              background: done
                                ? "color-mix(in srgb, var(--c-primary) 18%, transparent)"
                                : "transparent",
                            }}
                          >
                            {done ? (
                              <Icon
                                name="check"
                                className="text-[11px]"
                                style={{ color: "var(--c-primary)" }}
                              />
                            ) : (
                              <Icon
                                name="progress_activity"
                                className="text-[12px] animate-spin"
                                style={{ color: "var(--c-primary)" }}
                              />
                            )}
                          </span>
                          {active ? (
                            <span className="googenie-thinking-shimmer">
                              {p.label}…
                            </span>
                          ) : (
                            <span style={{ color: "var(--c-on-surface-variant)" }}>
                              {p.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          className="px-4 sm:px-6 pt-3 pb-4 border-t shrink-0"
          style={{ borderColor: "var(--c-outline-variant)", background: "var(--c-surface-container-low)" }}
        >
          <div className="max-w-2xl mx-auto">
            <div
              className="flex items-end gap-2 rounded-2xl px-3 py-2"
              style={{
                background: "var(--c-surface-container-lowest)",
                border: "1px solid var(--c-outline-variant)",
              }}
            >
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Message GooGenie…"
                className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed py-1.5 disabled:opacity-50"
                style={{ color: "var(--c-on-surface)", maxHeight: 200 }}
                disabled={busy}
              />
              <button
                onClick={() => void send()}
                disabled={busy || !prompt.trim()}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-transform disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:scale-105"
                style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
                title="Send (Enter)"
                aria-label="Send"
              >
                <Icon name={busy ? "progress_activity" : "arrow_upward"} className={`text-base ${busy ? "animate-spin" : ""}`} />
              </button>
            </div>
            <p className="text-[10px] text-center mt-1.5" style={{ color: "var(--c-on-surface-variant)" }}>
              Enter to send · Shift + Enter for newline · {agentCombo} to toggle
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
