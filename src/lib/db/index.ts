/**
 * Drizzle database client.
 *
 * `getDb()` is lazy on purpose: importing this module never opens a connection
 * or throws, so route modules and tests can import the query layer without a
 * live database. The pool is created on first query and cached on `globalThis`
 * so Next.js dev hot-reloads reuse one pool instead of leaking connections.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '@/lib/env';
import * as schema from './schema';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __sraDb?: Database };

export function getDb(): Database {
  if (globalForDb.__sraDb) return globalForDb.__sraDb;
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is required, see .env.example');
  }
  const pool = new Pool({ connectionString: env.databaseUrl });
  const db = drizzle(pool, { schema });
  globalForDb.__sraDb = db;
  return db;
}
