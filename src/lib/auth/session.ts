/**
 * Server-side session, the signed-in user for this deployment.
 *
 * Single-deployment: there is no tenant. Returns null when the request has no
 * session; callers decide what that means, a page redirects, an API route 401s.
 */

import { headers } from 'next/headers';

import { auth } from './auth';

export interface Session {
  userId: string;
}

export async function getSession(): Promise<Session | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { userId: session.user.id };
}

/** The 401 an API route returns when there is no session. */
export function unauthorized(): Response {
  return Response.json(
    { ok: false, error: { code: 'unauthorized', message: 'Sign in required.' } },
    { status: 401 },
  );
}
