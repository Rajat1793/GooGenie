/**
 * Safely extract a human-readable message from anything thrown in a catch block.
 * Replaces the `(e as Error).message` cast pattern that appeared 7+ times.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}
