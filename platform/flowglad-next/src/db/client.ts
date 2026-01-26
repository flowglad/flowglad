import { DefaultLogger } from 'drizzle-orm/logger'
import {
  drizzle,
  type PostgresJsDatabase,
} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { format } from 'sql-formatter'
import type { FileTestContext } from '@/test/globals'
import core from '@/utils/core'

const dbUrl = core.IS_TEST
  ? core.TEST_DB_URL
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

class FormattedSQLLogger extends DefaultLogger {
  override logQuery(query: string, params: unknown[]): void {
    const formatted = format(query, {
      language: 'postgresql',
      tabWidth: 2,
      keywordCase: 'upper',
      linesBetweenQueries: 2,
    })

    /* eslint-disable no-console */
    console.log('\n🔵 SQL Query:')
    console.log(formatted)
    if (params.length > 0) {
      console.log('\n📊 Parameters:', JSON.stringify(params, null, 2))
    }
    console.log('─'.repeat(80)) // Separator
    /* eslint-enable no-console */
  }
}

let logger: boolean | FormattedSQLLogger = true

if (core.IS_PROD) {
  logger = true
} else if (core.IS_TEST) {
  logger = false
} else if (core.IS_DEV) {
  logger = new FormattedSQLLogger()
}

/**
 * The main database instance.
 *
 * In test mode (dbtest files), this can be redirected to a test-specific
 * connection that uses savepoints for isolation. Set `globalThis.__testDb`
 * to redirect queries.
 */
const _db = drizzle(client, {
  logger,
})

// Import shared test file detection utility
// Note: This import is lazy-loaded only in test mode to avoid bundling test code in production
let getCurrentTestFileOrNull: (() => string | null) | undefined

/**
 * Get the test DB for the current context.
 * Looks up the correct DB based on the calling test file.
 */
function getTestDbForCurrentContext(): PostgresJsDatabase | null {
  // Only attempt test DB lookup in test mode
  if (!core.IS_TEST) {
    return null
  }

  // Lazy-load the test file detection function
  if (!getCurrentTestFileOrNull) {
    try {
      // Dynamic import to avoid bundling test utilities in production
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testFileDetection = require('@/test/db/testFileDetection')
      getCurrentTestFileOrNull =
        testFileDetection.getCurrentTestFileOrNull
    } catch {
      // Module not available (e.g., in production bundle)
      return null
    }
  }

  // Find the context for the current test file
  const filePath = getCurrentTestFileOrNull?.()
  if (!filePath) {
    return null
  }

  // Access the global contexts map (set by transactionIsolation.ts)
  const contexts = globalThis.__testContexts as
    | Map<string, FileTestContext>
    | undefined
  if (!contexts) {
    return null
  }

  const ctx = contexts.get(filePath)
  if (ctx?.db && ctx.inTransaction) {
    return ctx.db
  }

  return null
}

/**
 * Proxy that redirects to test DB when available.
 * This enables savepoint-based test isolation in *.dbtest.ts files.
 * Dynamically looks up the correct DB context based on the call stack.
 */
export const db: PostgresJsDatabase = new Proxy(_db, {
  get(target, prop, receiver) {
    // Try to find the test DB for the current context
    const testDb = getTestDbForCurrentContext()
    if (testDb) {
      return Reflect.get(testDb, prop, receiver)
    }
    return Reflect.get(target, prop, receiver)
  },
})

export default db
