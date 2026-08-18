import { redirect } from 'next/navigation';
import { SignIn } from '@clerk/nextjs';

/**
 * In-app sign-in page (optional catch-all so Clerk can own sub-paths like
 * /sign-in/sso-callback and the #/sso-callback hash route). Its existence is
 * what lets OAuth complete on this domain instead of Clerk's hosted Account
 * Portal at accounts.<domain>, which does not exist on a *.vercel.app host.
 */
export default function Page() {
  // Mirror the app's dual-mode auth: with no Clerk keys the app runs auth-free,
  // so there is no sign-in page to show — send visitors back to the app.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) redirect('/');

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
