/**
 * Lightweight in-process event bus.
 *
 * Used by mutation handlers to broadcast cache-invalidation hints to any
 * connected SSE clients for a given user/tenant. Replace with Redis pub/sub
 * for multi-instance deployments — same `publish/subscribe` shape applies.
 */
import { EventEmitter } from "node:events";

export type LiveEvent =
  | { kind: "email.changed"; userId: string; threadId?: string }
  | { kind: "email.received"; userId: string; threadId?: string }
  | { kind: "calendar.changed"; userId: string; eventId?: string }
  | { kind: "calendar.received"; userId: string; eventId?: string }
  | { kind: "feature.request.created"; userId: string; requestId: number; featureKey: string; requesterName: string }
  | { kind: "feature.request.decided"; userId: string; requestId: number; featureKey: string; decision: "approved" | "denied" }
  | { kind: "ping"; userId: string };

const bus = new EventEmitter();
// SSE handlers can attach lots of listeners
bus.setMaxListeners(0);

/** Publish an event for a single user; SSE subscribers for that userId will receive it. */
export function publish(event: LiveEvent): void {
  bus.emit(event.userId, event);
}

/** Subscribe to a user's stream. Returns an unsubscribe function. */
export function subscribe(userId: string, handler: (e: LiveEvent) => void): () => void {
  bus.on(userId, handler);
  return () => bus.off(userId, handler);
}
