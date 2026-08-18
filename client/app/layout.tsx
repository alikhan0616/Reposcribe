import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import 'highlight.js/styles/github-dark.css';

export const metadata: Metadata = {
  title: 'RepoScribe',
  description: 'Agentic RAG Codebase Assistant — chat with any GitHub repo.',
};

const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const html = (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
  // Only wrap in ClerkProvider when configured, so the app also runs auth-free.
  // Point Clerk at the app's own /sign-in and /sign-up routes so OAuth (and any
  // other sign-in redirect) completes on this domain, instead of Clerk's hosted
  // Account Portal at accounts.<domain> — which doesn't exist on a *.vercel.app
  // host. Fallback redirect URLs send users back into the app after auth.
  return hasClerk ? (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      {html}
    </ClerkProvider>
  ) : (
    html
  );
}
