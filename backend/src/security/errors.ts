import { randomUUID } from "node:crypto";

import type { ApiError, ApiErrorCode } from "../contracts/api-error.js";

export function createApiError(
  code: ApiErrorCode,
  message: string,
  retryable = false,
  traceId?: string
): ApiError {
  return {
    code,
    message,
    trace_id: traceId ?? randomUUID(),
    retryable
  };
}

export function statusFromApiError(code: ApiErrorCode): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "TOO_MANY_REQUESTS":
      return 429;
    case "VALIDATION_ERROR":
      return 400;
    default:
      return 500;
  }
}
