export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "TOO_MANY_REQUESTS"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  trace_id: string;
  retryable: boolean;
  /** Present on VALIDATION_ERROR — per-field error details */
  details?: FieldError[];
  /** Suggested retry-after seconds (present on TOO_MANY_REQUESTS) */
  retry_after?: number;
}
