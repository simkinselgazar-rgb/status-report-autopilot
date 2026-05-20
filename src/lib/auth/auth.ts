/**
 * Better Auth, the identity layer.
 *
 * Single-deployment: email + password sign-in, no multi-tenant organization
 * layer. Identities and sessions live in this project's own Postgres, no
 * third-party identity store, and no OAuth app to register.
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import { getDb } from '@/lib/db';
import * as authSchema from '@/lib/db/auth-schema';
import { env } from '@/lib/env';

export const auth = betterAuth({
  baseURL: env.appUrl,
  secret: env.betterAuthSecret,
  database: drizzleAdapter(getDb(), { provider: 'pg', schema: authSchema }),
  emailAndPassword: { enabled: true },
  plugins: [nextCookies()],
});
