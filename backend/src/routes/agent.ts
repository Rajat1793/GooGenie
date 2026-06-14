/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../auth/middleware.js";
import { agentExecuteSchema } from "../contracts/schemas.js";
import { emitAuditEvent } from "../security/audit.js";
import { createApiError } from "../security/errors.js";
import { chatWithTools, chat, isAiAvailable, MODEL } from "../integrations/openai.js";
import { fetchGmailThreads } from "../integrations/gmail.js";
import { getCorsairTenant } from "../integrations/corsair-tenant.js";
import { getUserById, getUserByClerkId } from "../db/users.js";
import type OpenAI from "openai";

export const agentRouter = Router();

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_threads",
      description: "List the user's recent email threads from their inbox",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max threads to return (default 5)" },
          query: { type: "string", description: "Optional Gmail search query" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compose_email",
      description: "Draft and/or send an email to a recipient",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body text" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_thread",
      description: "Summarize an email thread by its ID",
      parameters: {
        type: "object",
        properties: {
          thread_id: { type: "string", description: "The Gmail thread ID to summarize" },
          thread_subject: { type: "string", description: "Subject of the thread (for context)" },
        },
        required: ["thread_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
          start_time: { type: "string", description: "Start time in HH:MM format" },
          end_time: { type: "string", description: "End time in HH:MM format" },
          attendees: { type: "array", items: { type: "string" }, description: "List of attendee emails" },
        },
        required: ["title", "date", "start_time", "end_time"],
      },
    },
  },
];

/**
 * POST /v1/agent/execute
 * Natural-language → structured action. Uses OpenAI tool-calling when
 * OPENAI_API_KEY is set; falls back to keyword stub otherwise.
 */
agentRouter.post("/agent/execute", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const parsed = agentExecuteSchema.safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid agent execute payload", false, req.traceId);

    const { prompt, context } = parsed.data;

    if (!isAiAvailable()) {
      // Graceful fallback — keyword stub
      const result = keywordFallback(prompt);
      emitAuditEvent(req, "agent_execute", { prompt_length: prompt.length, action: result.action, mode: "stub" });
      res.status(200).json({ ...result, ai_available: false });
      return;
    }

    // Resolve user for Corsair tenant
    const dbUser = (await getUserById(auth.userId)) ?? (await getUserByClerkId(auth.userId));
    const corsairTenant = getCorsairTenant(auth.userId);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are GooGenie, an AI assistant for an email and calendar workspace.
The user's role is ${auth.role}. Help them accomplish tasks using the available tools.
Be concise and action-oriented. If you need to compose or summarize, use the tools directly.
Today is ${new Date().toDateString()}.`,
      },
      { role: "user", content: prompt },
    ];

    const completion = await chatWithTools(messages, TOOLS);
    if (!completion) {
      res.status(200).json({ action: "error", message: "AI unavailable", suggestions: [], ai_available: false });
      return;
    }

    const choice = completion.choices[0];
    const toolCalls = choice?.message?.tool_calls;

    // ── Handle tool calls ────────────────────────────────────────────────────
    if (toolCalls && toolCalls.length > 0) {
      const tc = toolCalls[0];
      // OpenAI SDK uses a discriminated union — narrow to function type
      if (tc.type !== "function") {
        res.status(200).json({ action: "chat", message: choice?.message?.content ?? "", suggestions: [], model: MODEL, ai_available: true });
        return;
      }
      const fnName = tc.function.name;
      const fnArgs = tc.function.arguments;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(fnArgs); } catch { /* ignore */ }

      let actionResult = { action: fnName, message: "", suggestions: [] as string[], data: {} as Record<string, unknown> };

      switch (fnName) {
        case "list_threads": {
          const threads = await fetchGmailThreads(corsairTenant, auth.userId, Number(args.limit ?? 5), String(args.query ?? "")).catch(() => []);
          const list = threads.slice(0, 5).map((t) => `• "${t.subject}" from ${t.from}`).join("\n");
          actionResult.message = threads.length > 0
            ? `Here are your recent emails:\n${list}`
            : "Your inbox appears to be empty.";
          actionResult.data = { threads: threads.slice(0, 5) };
          break;
        }
        case "compose_email": {
          actionResult.message = `Ready to send an email to ${args.to}:\nSubject: ${args.subject}\n\n${args.body}`;
          actionResult.suggestions = ["Confirm send", "Edit body", "Change tone"];
          actionResult.data = { to: args.to, subject: args.subject, body: args.body, action: "compose_ready" };
          break;
        }
        case "summarize_thread": {
          // Call the AI summarizer inline
          const summarizePrompt = `Summarize the email thread titled "${args.thread_subject ?? "unknown"}" (ID: ${args.thread_id}) in 2-3 sentences.`;
          const summary = await chat(summarizePrompt) ?? "Could not generate summary.";
          actionResult.message = summary;
          actionResult.data = { thread_id: args.thread_id };
          break;
        }
        case "create_calendar_event": {
          actionResult.message = `Ready to create event:\n"${args.title}" on ${args.date} from ${args.start_time} to ${args.end_time}`;
          actionResult.suggestions = ["Confirm create", "Add attendees", "Change time"];
          actionResult.data = { title: args.title, date: args.date, start_time: args.start_time, end_time: args.end_time, attendees: args.attendees ?? [], action: "event_ready" };
          break;
        }
        default:
          actionResult.message = choice?.message?.content ?? "I'm not sure how to help with that.";
      }

      emitAuditEvent(req, "agent_execute", { prompt_length: prompt.length, action: fnName, model: MODEL, mode: "llm" });
      res.status(200).json({ ...actionResult, model: MODEL, ai_available: true });
      return;
    }

    // ── Plain text response (no tool call) ───────────────────────────────────
    const message = choice?.message?.content ?? "I'm not sure how to help with that.";
    emitAuditEvent(req, "agent_execute", { prompt_length: prompt.length, action: "chat", model: MODEL, mode: "llm" });
    res.status(200).json({ action: "chat", message, suggestions: [], model: MODEL, ai_available: true });
  } catch (err) { next(err); }
});

// ── Keyword fallback (no API key) ─────────────────────────────────────────────
function keywordFallback(prompt: string): { action: string; message: string; suggestions: string[] } {
  const lower = prompt.toLowerCase();
  if (lower.includes("send") && (lower.includes("email") || lower.includes("mail")))
    return { action: "compose_email", message: "Use the Compose button in Inbox to send an email.", suggestions: ["Open Compose", "Check Inbox"] };
  if (lower.includes("schedule") || lower.includes("meeting") || lower.includes("event"))
    return { action: "create_event", message: "Use the Calendar page to schedule a new event.", suggestions: ["Go to Calendar", "Create event"] };
  if (lower.includes("summarize") || lower.includes("summary"))
    return { action: "summarize", message: "Open a thread and click ✨ Summarize to get an AI summary.", suggestions: ["Open Inbox", "Click Summarize"] };
  return {
    action: "unknown",
    message: "Add MISTRAL_API_KEY to enable AI agent mode. Currently limited to keyword matching.",
    suggestions: ["Send an email", "Schedule a meeting", "Summarize a thread"],
  };
}
