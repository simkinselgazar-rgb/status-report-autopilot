import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic auth gate. Checks only for a session cookie (no DB call), the
 * real session check happens in each page/route via getSession.
 *
 * Exempt (see `matcher`): /sign-in, the auth + cron APIs, the public report
 * (/r/*), and Next static assets. Everything else requires a session, an
 * unauthenticated page request redirects to /sign-in, an API request 401s.
 */
export function middleware(request: NextRequest): NextResponse {
  if (getSessionCookie(request)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorized', message: 'Sign in required.' } },
      { status: 401 },
    );
  }
  return NextResponse.redirect(new URL('/sign-in', request.url));
}

export const config = {
  matcher: ['/((?!sign-in|api/auth|api/cron|r/|_next|.*\\.).*)'],
};
