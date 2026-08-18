/**
 * Bridges Clerk's session token into the plain `fetch`-based API client without
 * coupling `lib/api.ts` to Clerk. A client component registers a token getter;
 * API calls attach it as a Bearer header. No-ops when auth is disabled.
 */
let tokenGetter: (() => Promise<string | null>) | null = null;

export function registerTokenGetter(fn: () => Promise<string | null>): void {
  tokenGetter = fn;
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  try {
    const token = await tokenGetter();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Whether Clerk auth is configured on the client. */
export const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
