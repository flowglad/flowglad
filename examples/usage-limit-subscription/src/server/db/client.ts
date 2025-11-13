import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

declare global {
  var __db_pool__: Pool | undefined;
}

const pool =
  globalThis.__db_pool__ ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

// Reuse the connection in dev to avoid exhausting connections on HMR
if (process.env.NODE_ENV !== 'production') {
  globalThis.__db_pool__ = pool;
}

export const db = drizzle(pool, { schema });
