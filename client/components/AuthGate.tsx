"use client";

import { useEffect } from "react";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { registerTokenGetter, authEnabled } from "@/lib/auth";
import { UserIdContext } from "@/lib/userContext";

/** Renders the app gated behind Clerk sign-in and registers the token getter. */
function ClerkGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();

  useEffect(() => {
    registerTokenGetter(() => getToken());
  }, [getToken]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight">RepoScribe</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Sign in to ingest repositories and chat with an agent about your code.
        </p>
        <SignInButton mode="modal">
          <button className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white hover:bg-blue-700">
            Sign in
          </button>
        </SignInButton>
      </main>
    );
  }

  return (
    <UserIdContext.Provider value={userId ?? "anonymous"}>
      <div className="fixed right-3 top-2 z-50">
        <UserButton />
      </div>
      {children}
    </UserIdContext.Provider>
  );
}

/**
 * Gates the app behind Clerk sign-in when configured; renders children directly
 * (single anonymous user) when auth is disabled.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  // No auth → single anonymous user; storage namespaces under `anonymous`.
  if (!authEnabled) return <>{children}</>;
  return <ClerkGate>{children}</ClerkGate>;
}
