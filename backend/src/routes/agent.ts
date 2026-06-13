/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../auth/middleware.js";
import { agentExecuteSchema } from "../contracts/schemas.js";
import { emitAuditEvent } from "../security/audit.js";
import { createApiError } from "../security/errors.js";

export const agentRouter = Router();

/**
 * POST /v1/agent/execute
 *
 * Accepts a natural-language prompt and optional context, returns a structured
 * response. Phase A: echo + structured stub response. Phase B: wire to LLM.
 *
 * Rate-limited to 3 tokens (write cost) per request.
 */
agentRouter.post("/agent/execute", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const parsed = agentExecuteSchema.safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid agent execute payload", false, req.traceId);

    const { prompt, context } = parsed.data;

    // --- Stub response (replace with LLM call in Phase B) ---
    const result = interpretPrompt(prompt, context ?? {});

    emitAuditEvent(req, "agent_execute", {
      prompt_length: prompt.length,
      action: result.action,
      tenant_id: auth.tenantId
    });

    res.status(200).json({
      action: result.action,
      message: result.message,
      suggestions: result.suggestions
    });
  } catch (err) { next(err); }
});

// ── Simple rule-based stub interpreter ───────────────────────────────────────

interface AgentResult {
  action: string;
  message: string;
  suggestions: string[];
}

function interpretPrompt(prompt: string, _context: Record<string, unknown>): AgentResult {
  const lower = prompt.toLowerCase();

  if (lower.includes("send") && (lower.includes("email") || lower.includes("mail"))) {
    return {
      action: "compose_email",
      message: "I can help you compose an email. Use POST /v1/email/messages/send with to, subject, and body.",
      suggestions: [
        "Who should the email go to?",
        "What is the subject?",
        "Would you like me to draft the body?"
      ]
    };
  }

  if (lower.includes("schedule") || lower.includes("meeting") || lower.includes("event")) {
    return {
      action: "create_event",
      message: "I can help you schedule a meeting. Use POST /v1/calendar/events.",
      suggestions: [
        "When should the meeting be?",
        "Who are the attendees?",
        "How long should it last?"
      ]
    };
  }

  if (lower.includes("available") || lower.includes("free") || lower.includes("busy")) {
    return {
      action: "check_availability",
      message: "I can check calendar availability. Use POST /v1/calendar/availability/check.",
      suggestions: [
        "What time range should I check?",
        "Whose calendar should I check?"
      ]
    };
  }

  if (lower.includes("reply") || lower.includes("respond")) {
    return {
      action: "reply_email",
      message: "I can help you reply to a thread. Use POST /v1/email/threads/:threadId/reply.",
      suggestions: [
        "Which thread should I reply to?",
        "What tone do you want? (formal / casual)"
      ]
    };
  }

  if (lower.includes("summarize") || lower.includes("summary")) {
    return {
      action: "summarize",
      message: "Thread summarization is available in Phase B. I can list your recent threads now.",
      suggestions: [
        "View your inbox at GET /v1/email/threads",
        "Full AI summarization coming soon"
      ]
    };
  }

  return {
    action: "unknown",
    message: "I didn't recognise that command yet. Try: send email, schedule meeting, check availability, reply, or summarize.",
    suggestions: [
      "Send an email",
      "Schedule a meeting",
      "Check availability",
      "Summarize inbox"
    ]
  };
}
