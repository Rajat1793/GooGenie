/**
 * Returns true only when Clerk is fully loaded AND the user is signed in.
 * Use this to gate API calls that require authentication.
 */
import { useAuth } from "@clerk/nextjs";

export function useClerkReady(): boolean {
  const { isLoaded, isSignedIn } = useAuth();
  return isLoaded && Boolean(isSignedIn);
}
