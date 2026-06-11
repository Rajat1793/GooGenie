import { randomUUID } from "node:crypto";

import type { ApiError, ApiErrorCode } from "../contracts/api-error.js";

export function createApiError(
  code: ApiErrorCode,
  message: string,
  retryable = false,
  traceId?: string,
  details?: import("../contracts/api-error.js").FieldError[]
): ApiError {
  const err: ApiError = {
    code,
    message,
    trace_id: traceId ?? randomUUID(),
    retryable
  };
  if (details?.length) err.details = details;
  if (code === "TOO_MANY_REQUESTS") err.retry_after = 60;
  return err;
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
    case "CONFLICT":
      return 409;
    default:
      return 500;
  }
}
