/**
 * Returns a Corsair tenant ID scoped per user.
 * Each authenticated user has their own OAuth token storage so they only
 * see their own Gmail / Google Calendar data.
 *
 * The returned ID is sanitized to avoid characters Corsair may not accept.
 */
export function getCorsairTenant(userId: string): string {
  // Replace anything non-alphanumeric (other than `_-`) with `_` and prefix
  // with `u_` so it never collides with seeded tenant ids like `dev`.
  const sanitized = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `u_${sanitized}`;
}
