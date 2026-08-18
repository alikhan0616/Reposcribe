'use client';

import { createContext, useContext } from 'react';

/**
 * The current user's id for namespacing client-side storage. `anonymous` when
 * Clerk auth is disabled (single-user mode); the Clerk user id otherwise. This
 * keeps one browser's recent-repos and cached chats separated per signed-in
 * user, and mirrors the server's own `anonymous` sentinel.
 */
export const UserIdContext = createContext<string>('anonymous');

export function useUserId(): string {
  return useContext(UserIdContext);
}
