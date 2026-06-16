/**
 * GET /api/v1/stream — Server-Sent Events push channel (Phase 7).
 *
 * Holds connection open, emits typed events from @googenie/server's event-bus.
 * Heartbeat every 25 s to defeat proxy idle timeouts (Render, nginx).
 *
 * Uses native Web Streams — works on the Node runtime out of the box.
 */
import { requireAuth, subscribe, type LiveEvent } from "@googenie/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap how long Render keeps the response open. 15 min is a safe ceiling for
// the free plan; client reconnects on disconnect so a periodic refresh is fine.
export const maxDuration = 900;

export async function GET(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if (!authResult.ok) return authResult.response;
  const userId = authResult.auth.userId;

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)); } catch { /* closed */ }
      };

      // Hello frame
      enqueue(`event: hello\ndata: ${JSON.stringify({ ok: true, userId })}\n\n`);

      unsubscribe = subscribe(userId, (event: LiveEvent) => {
        enqueue(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      heartbeat = setInterval(() => enqueue(`: heartbeat\n\n`), 25_000);

      // Client disconnect via AbortSignal
      const abort = req.signal;
      if (abort) {
        abort.addEventListener("abort", () => {
          try { controller.close(); } catch { /* already closed */ }
        });
      }
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
