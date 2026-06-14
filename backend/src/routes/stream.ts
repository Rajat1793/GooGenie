/**
 * Server-Sent Events (SSE) push channel.
 *
 * Clients connect to `/v1/stream` with their auth header. The server holds the
 * connection open and pushes `{ kind, ... }` events whenever their data
 * changes — emitted from mutation handlers via the event-bus, or from
 * Gmail/Calendar webhook receivers in production.
 *
 * The frontend uses each event to invalidate React Query keys, which triggers
 * a quiet background refetch — so the UI is always fresh without polling.
 */
/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { subscribe, type LiveEvent } from "../integrations/event-bus.js";

export const streamRouter = Router();

streamRouter.get("/stream", requireAuth, (req: Request, res: Response) => {
  const userId = req.auth!.userId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Initial hello so the client knows the channel is open
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, userId })}\n\n`);

  const send = (event: LiveEvent) => {
    res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const unsubscribe = subscribe(userId, send);

  // Heartbeat every 25s — keeps proxies (Render, nginx) from closing idle connections
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});
