import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// Clerk's middleware only runs when configured; otherwise a pass-through.
export default hasClerk ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    '/((?!_next|.*\\..*).*)',
    '/(api|trpc)(.*)',
    // Clerk's production auto-proxy on a *.vercel.app host serves the Frontend
    // API and clerk-js from this app's own origin under /__clerk. Those asset
    // paths contain dots (e.g. clerk.browser.js), so the first matcher above
    // excludes them — this entry routes them through clerkMiddleware instead.
    '/__clerk/:path*',
  ],
};
