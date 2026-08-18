import { redirect } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';

/**
 * In-app sign-up page — counterpart to /sign-in. Keeps the full sign-up /
 * verification flow on this domain rather than the hosted Account Portal.
 */
export default function Page() {
  // Mirror the app's dual-mode auth (see /sign-in): no keys → no auth UI.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) redirect('/');

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignUp />
    </main>
  );
}
