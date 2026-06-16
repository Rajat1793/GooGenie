import { createHmac, timingSafeEqual } from "node:crypto";

import type { AccessTokenPayload } from "./context";
import { ALL_ROLES } from "./roles";
import { env } from "../security/env";

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payloadPart: string): string {
  return createHmac("sha256", env.NIMBUS_ACCESS_TOKEN_SECRET).update(payloadPart).digest("base64url");
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = sign(payloadPart);
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(signaturePart);
  if (expectedBuffer.length !== providedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
    return null;
  }

  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart)) as AccessTokenPayload;
  } catch {
    return null;
  }

  if (!payload.sub || !payload.tenant_id || !payload.role || !payload.exp) {
    return null;
  }

  if (!ALL_ROLES.includes(payload.role)) {
    return null;
  }

  if (Date.now() >= payload.exp * 1000) {
    return null;
  }

  return payload;
}

export function createAccessToken(payload: AccessTokenPayload): string {
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  return `${payloadPart}.${sign(payloadPart)}`;
}
