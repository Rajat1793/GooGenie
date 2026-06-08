const SENSITIVE_KEYS = [
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "client_secret",
  "api_key"
];

export function redactSensitive<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((value) => redactSensitive(value)) as T;
  }

  if (typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>).map(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((sensitiveKey) => lowerKey.includes(sensitiveKey))) {
        return [key, "[REDACTED]"];
      }
      return [key, redactSensitive(value)];
    });
    return Object.fromEntries(entries) as T;
  }

  return input;
}

export { SENSITIVE_KEYS };
