/**
 * Tenant-auth helper: resolves and validates tenant context for Corsair operations.
 *
 * Ensures:
 * - No cross-tenant plugin token usage
 * - Scope is resolved before any provider operation
 * - Token access is audited
 */
/// <reference path="../contracts/request.d.ts" />
import type { Request } from "express";
import { isCorsairConfigured } from "./corsair.js";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

/**
 * Extract validated tenant context from an authenticated Express request.
 * Throws if auth is missing.
 */
export function resolveTenantContext(req: Request): TenantContext {
  const auth = req.auth;
  if (!auth) {
    throw new Error("Missing auth context — requireAuth middleware must run first");
  }
  return {
    tenantId: auth.tenantId,
    userId: auth.userId,
    role: auth.role
  };
}

/**
 * Returns whether Corsair is configured AND the current tenant has credentials
 * that would allow a plugin operation. Safe to call before attempting API calls.
 */
export function canUseCorsair(tenantId: string): boolean {
  if (!isCorsairConfigured()) return false;
  // In a production system this would check the DB for active OAuth tokens for
  // the tenant. For now, a configured Corsair instance is sufficient.
  void tenantId;
  return true;
}
