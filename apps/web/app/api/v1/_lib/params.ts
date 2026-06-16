/**
 * Coerce a Next.js dynamic route param to a single string.
 * Next 15 surfaces params as `string | string[]` (catch-all routes can be arrays).
 * Combined with `noUncheckedIndexedAccess`, the obvious ternary leaks `undefined`,
 * so this helper is the single canonical narrowing site.
 */
export function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
