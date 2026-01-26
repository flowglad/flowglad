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
 * In test mode (db.test files), this can be redirected to a test-specific
 * connection that uses savepoints for isolation. Set `globalThis.__testDb`
 * to redirect queries.
 */
const _db = drizzle(client, {
  logger,
})

// Import shared test file detection utility
// Note: This import is lazy-loaded only in test mode to avoid bundling test code in production
let getCurrentTestFileOrNull: (() => string | null) | undefined
let UNKNOWN_TEST_FILE: string | undefined

/**
 * Get the test context for the current file.
 * Looks up the correct context based on the calling test file.
 * Falls back to the shared context key if no file-specific context exists.
 */
function getTestContextForCurrentFile(): FileTestContext | null {
  // Only attempt test context lookup in test mode
  if (!core.IS_TEST) {
    return null
  }

  // Lazy-load the test file detection function and fallback key
  if (!getCurrentTestFileOrNull) {
    try {
      // Dynamic import to avoid bundling test utilities in production
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testFileDetection = require('@/test/db/testFileDetection')
      getCurrentTestFileOrNull =
        testFileDetection.getCurrentTestFileOrNull
      UNKNOWN_TEST_FILE = testFileDetection.UNKNOWN_TEST_FILE
    } catch {
      // Module not available (e.g., in production bundle)
      return null
    }
  }

  // Access the global contexts map (set by transactionIsolation.ts)
  const contexts = globalThis.__testContexts as
    | Map<string, FileTestContext>
    | undefined
  if (!contexts) {
    return null
  }

  // Find the context for the current test file
  const filePath = getCurrentTestFileOrNull?.()
  if (filePath) {
    const ctx = contexts.get(filePath)
    if (ctx?.db && ctx.inTransaction) {
      return ctx
    }
  }

  // Fall back to the shared context key
  // This handles the case where beginOuterTransaction() ran from a setup file
  // (storing context under the fallback key) but we're querying from a test file
  if (UNKNOWN_TEST_FILE) {
    const fallbackCtx = contexts.get(UNKNOWN_TEST_FILE)
    if (fallbackCtx?.db && fallbackCtx.inTransaction) {
      return fallbackCtx
    }
  }

  return null
}

// Track nesting depth for savepoint transactions
// When we're already inside a savepoint wrapper, we don't need another level
let savepointNestingDepth = 0

/**
 * Creates a transaction wrapper that uses the test DB directly.
 *
 * When code calls db.transaction() inside a test, we're already inside the test's
 * outer transaction (managed by transactionIsolation.ts). We don't want Drizzle to
 * issue BEGIN/COMMIT because that would end the test isolation.
 *
 * Instead of creating nested savepoints (which cause issues with error propagation
 * in concurrent operations), we simply run the callback directly with the test DB.
 * The test's outer savepoint (sp_1, sp_2, etc.) provides the isolation boundary.
 *
 * This approach:
 * - Avoids nested savepoint complexity
 * - Lets errors propagate naturally
 * - Relies on the test framework's rollback to clean up
 */
function createSavepointTransaction(ctx: FileTestContext) {
  return async function savepointTransaction<T>(
    callback: (tx: PostgresJsDatabase) => Promise<T>
  ): Promise<T> {
    savepointNestingDepth++
    try {
      // Run the callback with the test DB (which is already transactional)
      // The callback expects a "transaction" object, which in Drizzle is just
      // a DB instance scoped to the transaction - our test DB works for this
      return await callback(ctx.db)
    } finally {
      savepointNestingDepth--
    }
  }
}

/**
 * Proxy that redirects to test DB when available.
 * This enables savepoint-based test isolation in *.db.test.ts files.
 * Dynamically looks up the correct DB context based on the call stack.
 *
 * Special handling for db.transaction():
 * When test isolation is active, calling db.transaction() would normally issue
 * BEGIN/COMMIT which would end the test's outer transaction. Instead, we
 * intercept and use savepoints for nested transaction semantics.
 */
export const db: PostgresJsDatabase = new Proxy(_db, {
  get(target, prop, receiver) {
    // Try to find the test context for the current file
    const testCtx = getTestContextForCurrentFile()

    if (testCtx) {
      // Special handling for transaction() - use savepoints instead of BEGIN/COMMIT
      if (prop === 'transaction') {
        return createSavepointTransaction(testCtx)
      }

      // For all other properties, redirect to the test DB
      return Reflect.get(testCtx.db, prop, receiver)
    }

    return Reflect.get(target, prop, receiver)
  },
})

export default db
