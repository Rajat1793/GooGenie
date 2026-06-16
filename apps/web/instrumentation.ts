/**
 * Next.js instrumentation hook (Phase 3).
 * Runs once on server boot in the Node runtime.
 *
 * - Initialises Corsair (loads OAuth keys, registers plugins)
 * - Runs additive Postgres migrations
 * - Prewarms the Clerk JWKS cache
 *
 * `serverExternalPackages` in next.config.mjs keeps heavy CJS deps as runtime
 * requires; the early `NEXT_RUNTIME` guard prevents this code from running
 * in the Edge bundle even though webpack traces it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  try {
    const [serverMod, dbMod, clerkJwtMod] = await Promise.all([
      import("@googenie/server"),
      import("@googenie/db"),
      import("@googenie/server/auth/clerk-jwt"),
    ]);

    const { corsair, setupCorsair, isCorsairConfigured } = serverMod;
    const { runStartupMigrations } = dbMod;
    const { prewarmJwksCache } = clerkJwtMod;

    // Run migrations FIRST so Corsair finds its tables.
    await runStartupMigrations();

    if (isCorsairConfigured()) {
      await setupCorsair(corsair);

      // Persist OAuth client credentials in Corsair's keys store. Without
      // this the connect/init route fails with "client_id not configured".
      // Inline `credentials: { clientId, clientSecret }` on the plugin
      // factory is not sufficient — Corsair reads from its encrypted keys
      // table at OAuth time. Re-running these is idempotent.
      const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
      const topicId = process.env.GMAIL_TOPIC_ID ?? "";
      if (clientId && clientSecret) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const keys = (corsair as any).keys;
          await Promise.all([
            keys.gmail.set_client_id(clientId),
            keys.gmail.set_client_secret(clientSecret),
            ...(topicId ? [keys.gmail.set_topic_id(topicId)] : []),
            keys.googlecalendar.set_client_id(clientId),
            keys.googlecalendar.set_client_secret(clientSecret),
          ]);
          console.log("[instrumentation] Corsair OAuth credentials persisted");
        } catch (err) {
          console.warn("[instrumentation] Failed to persist Corsair keys:", (err as Error).message);
        }
      }
    } else {
      console.warn("[instrumentation] Corsair not configured — skipping setupCorsair()");
    }
    await prewarmJwksCache();

    // ── Scheduled-email poller ───────────────────────────────────────────
    // Picks queued sends whose send_at has passed and flushes them via Gmail.
    // 3-second tick is fine for the 10s undo-send window. Single-process —
    // SELECT … FOR UPDATE SKIP LOCKED in claimDueScheduledEmails() keeps it
    // safe even if multiple Render instances run later.
    try {
      const { startScheduledEmailPoller } = await import(
        "@googenie/server/integrations/scheduled-email-poller"
      );
      startScheduledEmailPoller();
    } catch (err) {
      console.warn("[instrumentation] scheduled-email poller skipped:", (err as Error).message);
    }

    console.log("[instrumentation] boot complete (migrations + corsair + jwks + poller)");
  } catch (err) {
    console.error("[instrumentation] startup failed:", err);
  }
}
