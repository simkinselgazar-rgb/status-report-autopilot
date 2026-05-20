/**
 * Better Auth browser client, sign-in, sign-up, and sign-out for client
 * components. Same-origin, so it needs no baseURL.
 */

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();
