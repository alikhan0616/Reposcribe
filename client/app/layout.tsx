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
  return hasClerk ? <ClerkProvider>{html}</ClerkProvider> : html;
}
