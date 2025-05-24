import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import core from '@/utils/core'

const TEST_DB_URL = 'postgresql://test:test@localhost:5432/test_db'
const dbUrl = core.IS_TEST
  ? TEST_DB_URL
  : core.envVariable('DATABASE_URL')
/**
 * Very important to set prepare to false when connecting to a Supabase DB
 * via the connection pool URL in the "transaction" batch setting.
 * Supabase's connection pool URL does not support prepared statements
 * in transaction mode.
 *
 * If you don't set `prepare: false`, your DB will silently fail to execute
 * any more than 1 transaction per request.
 * @see https://orm.drizzle.team/docs/get-started-postgresql#supabase
 * @see https://supabase.com/docs/guides/database/connecting-to-postgres#connecting-with-drizzle
 */
const client = postgres(dbUrl, {
  max: 15,
  idle_timeout: 5,
  prepare: false,
  debug: true,
})

let logger = false

if (core.IS_PROD) {
  logger = true
} else if (core.IS_TEST) {
  logger = true
} else if (core.IS_DEV) {
  logger = true
}

export const db = drizzle(client, {
  logger,
})

export default db
