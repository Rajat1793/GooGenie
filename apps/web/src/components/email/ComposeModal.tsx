"use client";

/**
 * New-message compose modal. Extracted from InboxPage so the page itself
 * only owns list/detail orchestration. Self-contained: owns its own state,
 * dispatches `emailApi.send` then closes via the parent callback.
 */
import { useEffect, useMemo, useState } from "react";
import { emailApi, aiApi, snippetsApi, type SnippetRow } from "../../api/client";
import { AI_TONES, type AiTone } from "../../lib/aiTones";
import { getErrorMessage } from "../../lib/errors";
import { Icon } from "../../components/Icon";
import { useFeatures } from "../../contexts/FeatureContext";

interface ComposeModalProps {
  onClose: () => void;
  canAiCompose: boolean;
}

export function ComposeModal({ onClose, canAiCompose }: ComposeModalProps) {
  const { hasFeature } = useFeatures();
  const canPersonalize = hasFeature("ai_personalized_compose");
  const canScheduleSend = hasFeature("schedule_send");
  const canInlineCommands = hasFeature("ai_inline_commands");
  const canSnippets = hasFeature("snippets");

  // Snippets cache for inline expansion (`;hotkey<Tab|Space>` → body).
  const [snippetList, setSnippetList] = useState<SnippetRow[]>([]);
  useEffect(() => {
    if (!canSnippets) return;
    let cancelled = false;
    snippetsApi.list().then(
      (r) => { if (!cancelled) setSnippetList(r.snippets); },
      () => { /* silent — expansion just won't fire */ },
    );
    return () => { cancelled = true; };
  }, [canSnippets]);
  const snippetByHotkey = useMemo(() => {
    const m = new Map<string, SnippetRow>();
    for (const s of snippetList) m.set(s.hotkey.toLowerCase(), s);
    return m;
  }, [snippetList]);
  const [snippetNote, setSnippetNote] = useState<string | null>(null);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Schedule-send state (feature: schedule_send)
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [customSchedule, setCustomSchedule] = useState("");

  // Inline AI command state (feature: ai_inline_commands)
  // Tracks the most recent /command run so we can show inline status.
  const [inlineCmdBusy, setInlineCmdBusy] = useState<string | null>(null);
  const [inlineCmdNote, setInlineCmdNote] = useState<string | null>(null);

  // AI Compose state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTone, setAiTone] = useState<AiTone>("professional");
  const [aiContext, setAiContext] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAlts, setAiAlts] = useState<string[]>([]);
  // Feature C4 — match the user's historical writing style with this recipient.
  const [matchStyle, setMatchStyle] = useState(false);
  const [styleApplied, setStyleApplied] = useState<boolean | null>(null);

  // Build a list of Quick-schedule options relative to now.
  function quickScheduleOptions(): Array<{ label: string; iso: string }> {
    const opts: Array<{ label: string; iso: string }> = [];
    const now = new Date();
    // Later today — 4 hours from now, rounded to next 15 min.
    const later = new Date(now.getTime() + 4 * 3600 * 1000);
    later.setMinutes(Math.ceil(later.getMinutes() / 15) * 15, 0, 0);
    if (later.getHours() < 22) opts.push({ label: `Later today (${later.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`, iso: later.toISOString() });
    // Tomorrow morning at 9 AM.
    const tom = new Date(now);
    tom.setDate(tom.getDate() + 1);
    tom.setHours(9, 0, 0, 0);
    opts.push({ label: `Tomorrow morning (9:00 AM)`, iso: tom.toISOString() });
    // Tomorrow afternoon at 1 PM.
    const tomPm = new Date(now);
    tomPm.setDate(tomPm.getDate() + 1);
    tomPm.setHours(13, 0, 0, 0);
    opts.push({ label: `Tomorrow afternoon (1:00 PM)`, iso: tomPm.toISOString() });
    // Monday 9 AM.
    const mon = new Date(now);
    const daysToMon = ((1 - mon.getDay() + 7) % 7) || 7;
    mon.setDate(mon.getDate() + daysToMon);
    mon.setHours(9, 0, 0, 0);
    opts.push({ label: `Monday morning (${mon.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} 9:00 AM)`, iso: mon.toISOString() });
    return opts;
  }

  async function handleSend(scheduledIso?: string) {
    if (!to.trim() || !subject.trim() || !body.trim()) { setErr("To, subject, and body are required"); return; }
    setSending(true); setErr(null);
    try {
      if (scheduledIso) {
        // Send-later — queue with explicit send_at; no Undo toast (user is committing).
        const scheduled = await emailApi.schedule({ to, subject, body, send_at: scheduledIso });
        window.dispatchEvent(
          new CustomEvent("googenie:toast", {
            detail: { message: `📨 Scheduled for ${new Date(scheduled.sendAt).toLocaleString()}`, icon: "schedule_send" },
          }),
        );
        onClose();
        return;
      }
      // Default: queue with a 10s undo window. The poller in instrumentation.ts will
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
    setStyleApplied(null);
    try {
      // Feature C4 — pass recipient as personalize_for when "Match my style" is on.
      const recipientEmail = (() => {
        if (!matchStyle || !canPersonalize) return undefined;
        const trimmed = to.trim();
        const match = /<([^>]+)>/.exec(trimmed);
        const candidate = (match ? match[1] : trimmed.split(",")[0] ?? "").trim();
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : undefined;
      })();
      const r = await aiApi.compose({
        type: "new",
        tone: aiTone,
        context: aiContext || subject,
        recipient_name: to,
        ...(recipientEmail ? { personalize_for: recipientEmail } : {}),
      });
      if (!r.ai_available) { setErr(r.hint ?? "AI not configured"); return; }
      setBody(r.body);
      if (r.subject && !subject) setSubject(r.subject);
      setAiAlts(r.alternatives ?? []);
      setStyleApplied(matchStyle ? Boolean(r.personalized) : null);
      setShowAiPanel(false);
    } catch (e) { setErr(getErrorMessage(e, "AI failed")); }
    finally { setAiLoading(false); }
  }

  /**
   * Feature: ai_inline_commands
   *
   * When the user types a slash-command on its OWN line and presses Tab,
   * we intercept it and rewrite the body. Supported:
   *   /improve       — polish the draft
   *   /shorten       — trim by ~50%
   *   /formal        — rewrite in a formal register
   *   /casual        — rewrite in a casual register
   *   /translate <lang>  — translate to <lang> (best-effort)
   *
   * The command line is replaced with the AI output (or the rewritten draft).
   * If body has selected text, only the selection is rewritten.
   */
  const INLINE_COMMANDS: Record<string, { prompt: (text: string, arg?: string) => string; needsArg?: boolean }> = {
    "/improve": { prompt: (text) => `Improve the wording, clarity, and grammar of this email text without changing its meaning. Return ONLY the improved text, no preface.\n\n---\n${text}\n---` },
    "/shorten": { prompt: (text) => `Shorten this email text by ~50% while preserving the key points. Return ONLY the shortened text, no preface.\n\n---\n${text}\n---` },
    "/formal":  { prompt: (text) => `Rewrite this email text in a formal, professional register. Return ONLY the rewritten text, no preface.\n\n---\n${text}\n---` },
    "/casual":  { prompt: (text) => `Rewrite this email text in a friendly, casual register. Return ONLY the rewritten text, no preface.\n\n---\n${text}\n---` },
    "/translate": { prompt: (text, arg) => `Translate this email text to ${arg ?? "English"}. Return ONLY the translation, no preface.\n\n---\n${text}\n---`, needsArg: true },
  };

  async function runInlineCommand(textareaEl: HTMLTextAreaElement, command: string, arg: string | undefined, lineStart: number, lineEnd: number) {
    const def = INLINE_COMMANDS[command];
    if (!def) return;
    if (def.needsArg && !arg) {
      setInlineCmdNote(`${command} requires an argument (e.g. "${command} french")`);
      setTimeout(() => setInlineCmdNote(null), 3000);
      return;
    }
    // Decide on target: if there is a selection, use it; otherwise rewrite the
    // entire body BEFORE the command line.
    const hasSelection = textareaEl.selectionStart !== textareaEl.selectionEnd;
    const before = body.slice(0, lineStart);
    const after = body.slice(lineEnd);
    let target: string;
    let replaceFrom: number;
    let replaceTo: number;
    if (hasSelection && (textareaEl.selectionStart < lineStart || textareaEl.selectionEnd > lineEnd)) {
      target = body.slice(textareaEl.selectionStart, textareaEl.selectionEnd);
      replaceFrom = textareaEl.selectionStart;
      replaceTo = textareaEl.selectionEnd;
    } else {
      target = before.trim();
      replaceFrom = 0;
      replaceTo = lineEnd;
      // Preserve trailing newline after command if any.
      if (after.startsWith("\n")) replaceTo += 1;
    }
    if (!target.trim()) {
      setInlineCmdNote(`${command} needs some text above it to rewrite.`);
      setTimeout(() => setInlineCmdNote(null), 3000);
      return;
    }

    setInlineCmdBusy(command);
    setInlineCmdNote(null);
    try {
      const r = await aiApi.compose({
        type: "new",
        tone: aiTone,
        // Pack the prompt into `context`; the server has a strong system prompt
        // ("expert email writing assistant, valid JSON") so we ask for body field.
        context: def.prompt(target, arg),
      });
      if (!r.ai_available) {
        setInlineCmdNote(r.hint ?? "AI not configured");
        setTimeout(() => setInlineCmdNote(null), 3000);
        return;
      }
      const rewritten = (r.body ?? "").trim();
      if (!rewritten) {
        setInlineCmdNote("AI returned empty result.");
        setTimeout(() => setInlineCmdNote(null), 3000);
        return;
      }
      const newBody = body.slice(0, replaceFrom) + rewritten + body.slice(replaceTo);
      setBody(newBody);
      setInlineCmdNote(`${command} applied`);
      setTimeout(() => setInlineCmdNote(null), 2000);
    } catch (e) {
      setInlineCmdNote(getErrorMessage(e, "Inline command failed"));
      setTimeout(() => setInlineCmdNote(null), 3000);
    } finally {
      setInlineCmdBusy(null);
    }
  }

  function handleBodyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Snippet expansion runs FIRST so it can short-circuit Tab/Space before
    // the inline-AI handler interprets Tab as a /command trigger.
    if (canSnippets && (e.key === "Tab" || e.key === " ")) {
      const ta = e.currentTarget;
      const cursor = ta.selectionStart;
      if (cursor === ta.selectionEnd) {
        // Look back from the cursor for a `;hotkey` token.
        const lineStart = body.lastIndexOf("\n", cursor - 1) + 1;
        const beforeCursor = body.slice(lineStart, cursor);
        const m = /(^|\s)(;([a-zA-Z0-9_-]{1,32}))$/.exec(beforeCursor);
        if (m) {
          const hotkey = m[3].toLowerCase();
          const snippet = snippetByHotkey.get(hotkey);
          if (snippet) {
            e.preventDefault();
            // Replace `;hotkey` (length = m[2].length) with the snippet body.
            const tokenLen = m[2].length;
            const replaceFrom = cursor - tokenLen;
            const newBody = body.slice(0, replaceFrom) + snippet.body + body.slice(cursor);
            setBody(newBody);
            // Move cursor to end of inserted snippet on next tick.
            const newCursor = replaceFrom + snippet.body.length;
            requestAnimationFrame(() => {
              ta.selectionStart = ta.selectionEnd = newCursor;
              ta.focus();
            });
            setSnippetNote(`Expanded “${snippet.name}”`);
            setTimeout(() => setSnippetNote(null), 1500);
            return;
          }
        }
      }
    }

    if (!canInlineCommands) return;
    if (e.key !== "Tab") return;
    const ta = e.currentTarget;
    const cursor = ta.selectionStart;
    // Find current-line bounds.
    const lineStart = body.lastIndexOf("\n", cursor - 1) + 1;
    const lineEndRaw = body.indexOf("\n", cursor);
    const lineEnd = lineEndRaw === -1 ? body.length : lineEndRaw;
    const line = body.slice(lineStart, lineEnd).trim();
    if (!line.startsWith("/")) return;
    const [cmdWordRaw, ...rest] = line.split(/\s+/);
    const cmdWord = cmdWordRaw.toLowerCase();
    if (!(cmdWord in INLINE_COMMANDS)) return;
    e.preventDefault();
    const arg = rest.join(" ").trim() || undefined;
    void runInlineCommand(ta, cmdWord, arg, lineStart, lineEnd);
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
            {/* Feature C4 — Match my style toggle (gated on ai_personalized_compose) */}
            {canPersonalize && (
              <label
                className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl cursor-pointer transition-all text-xs"
                style={{
                  background: matchStyle
                    ? "color-mix(in srgb, var(--c-tertiary) 10%, transparent)"
                    : "var(--c-surface-container)",
                  border: `1px solid ${matchStyle ? "color-mix(in srgb, var(--c-tertiary) 30%, transparent)" : "var(--c-outline-variant)"}`,
                  color: matchStyle ? "var(--c-tertiary)" : "var(--c-on-surface-variant)",
                }}
              >
                <input
                  type="checkbox"
                  checked={matchStyle}
                  onChange={(e) => setMatchStyle(e.target.checked)}
                  className="w-3.5 h-3.5 accent-current"
                  style={{ accentColor: "var(--c-tertiary)" }}
                />
                <Icon name="signature" className="text-base" />
                <span className="font-semibold">Match my style with this person</span>
                <span className="ml-auto text-[10px]">
                  {styleApplied === true ? "✓ applied" : styleApplied === false ? "(no past samples)" : ""}
                </span>
              </label>
            )}
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
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleBodyKeyDown}
          placeholder={
            canInlineCommands
              ? "Compose… (type /improve, /shorten, /formal, /casual, /translate <lang> then Tab)"
              : canSnippets
                ? "Compose…  (tip: type ;hotkey then Tab to expand a snippet)"
                : "Compose…"
          }
          className="flex-1 px-6 py-4 bg-transparent text-sm outline-none resize-none min-h-[180px]"
          style={{ color: "var(--c-on-surface)" }}
        />
        {snippetNote && (
          <div
            className="mx-6 mb-2 rounded-lg px-3 py-1.5 text-[11px] flex items-center gap-1.5"
            style={{
              background: "color-mix(in srgb, var(--c-primary) 8%, transparent)",
              color: "var(--c-primary)",
              border: "1px solid color-mix(in srgb, var(--c-primary) 20%, transparent)",
            }}
          >
            <Icon name="code_blocks" className="text-sm" />
            {snippetNote}
          </div>
        )}
        {(inlineCmdBusy || inlineCmdNote) && (
          <div
            className="mx-6 mb-2 rounded-lg px-3 py-1.5 text-[11px] flex items-center gap-1.5"
            style={{
              background: "color-mix(in srgb, var(--c-tertiary) 8%, transparent)",
              color: "var(--c-tertiary)",
              border: "1px solid color-mix(in srgb, var(--c-tertiary) 20%, transparent)",
            }}
          >
            <Icon name={inlineCmdBusy ? "progress_activity" : "terminal"} className={`text-sm ${inlineCmdBusy ? "animate-spin" : ""}`} />
            {inlineCmdBusy ? `Running ${inlineCmdBusy}…` : inlineCmdNote}
          </div>
        )}
        <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid var(--c-outline-variant)" }}>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          {canScheduleSend && (
            <div className="relative">
              <button
                onClick={() => setShowSchedulePicker((v) => !v)}
                disabled={sending}
                className="btn-secondary flex items-center gap-1.5 disabled:opacity-50"
                title="Schedule send"
              >
                <Icon name="schedule_send" className="text-base" />
                Send later
              </button>
              {showSchedulePicker && (
                <div
                  className="absolute right-0 bottom-full mb-2 rounded-xl shadow-xl p-2 w-72 z-10"
                  style={{ background: "var(--c-surface-container-high)", border: "1px solid var(--c-outline-variant)" }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest px-2 py-1.5" style={{ color: "var(--c-on-surface-variant)" }}>
                    Schedule Send
                  </p>
                  {quickScheduleOptions().map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setShowSchedulePicker(false);
                        void handleSend(opt.iso);
                      }}
                      className="w-full text-left px-2 py-2 rounded-lg text-sm hover:bg-primary/8"
                      style={{ color: "var(--c-on-surface)" }}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <div className="border-t mt-2 pt-2" style={{ borderColor: "var(--c-outline-variant)" }}>
                    <label className="block text-[10px] font-bold uppercase tracking-widest mb-1 px-2" style={{ color: "var(--c-on-surface-variant)" }}>
                      Custom
                    </label>
                    <div className="flex items-center gap-2 px-2">
                      <input
                        type="datetime-local"
                        value={customSchedule}
                        onChange={(e) => setCustomSchedule(e.target.value)}
                        className="input-field text-xs flex-1"
                      />
                      <button
                        disabled={!customSchedule}
                        onClick={() => {
                          const d = new Date(customSchedule);
                          if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now() + 60_000) {
                            setShowSchedulePicker(false);
                            void handleSend(d.toISOString());
                          } else {
                            setErr("Custom send time must be at least 1 minute in the future");
                          }
                        }}
                        className="btn-primary text-xs px-2 py-1 disabled:opacity-50"
                      >
                        Go
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <button onClick={() => void handleSend()} disabled={sending} className="btn-primary disabled:opacity-50 flex items-center gap-2">
            {sending ? <Icon name="progress_activity" className="animate-spin text-base" /> : <Icon name="send" className="text-base" />}
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
