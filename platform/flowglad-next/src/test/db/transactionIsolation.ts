/**
 * Per-Test Transaction Isolation with Per-File Connections
 *
 * Provides savepoint-based transaction isolation for DB-backed tests.
 * Each test FILE gets its own dedicated connection with an outer transaction.
 * Tests within a file create savepoints that rollback after each test.
 *
 * Architecture:
 * - Each file creates its own postgres connection (not pooled)
 * - beforeAll creates connection, drizzle instance, and starts transaction
 * - beforeEach creates a savepoint
 * - afterEach rolls back to the savepoint
 * - afterAll rolls back the transaction and closes the connection
 *
 * This ensures:
 * 1. Files can run in parallel (each has its own connection)
 * 2. Tests within a file don't affect each other (savepoint rollback)
 * 3. No test data persists (outer transaction rollback)
 *
 * Debug logging: Set DEBUG_TEST_DB=1 to enable verbose logging for troubleshooting.
 */

import {
  drizzle,
  type PostgresJsDatabase,
} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  getCurrentTestFile,
  UNKNOWN_TEST_FILE,
} from '@/test/db/testFileDetection'
// Import consolidated global types and shared utilities
import type { FileTestContext } from '@/test/globals'

// Ensure global contexts map exists
function getContextsMap(): Map<string, FileTestContext> {
  if (!globalThis.__testContexts) {
    globalThis.__testContexts = new Map()
  }
  return globalThis.__testContexts
}

/**
 * Debug logging helper. Enabled by DEBUG_TEST_DB=1 environment variable.
 */
function debugLog(message: string, ...args: unknown[]): void {
  if (process.env.DEBUG_TEST_DB === '1') {
    // eslint-disable-next-line no-console
    console.log(`[transactionIsolation] ${message}`, ...args)
  }
}

/**
 * Get connection string from environment.
 */
function getConnectionString(): string {
  const connectionString =
    process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL or TEST_DATABASE_URL environment variable is not set'
    )
  }
  return connectionString
}

/**
 * Get the current file's test context.
 *
 * This function has fallback logic to handle cases where the stack trace
 * detection returns different keys at different points (e.g., beforeAll
 * might store under the test file path, but afterEach might look up
 * under UNKNOWN_TEST_FILE, or vice versa).
 *
 * The fallback ensures consistency: if the exact file path isn't found,
 * we check the shared context key (UNKNOWN_TEST_FILE) as a fallback.
 */
function getCurrentContext(): FileTestContext | undefined {
  const filePath = getCurrentTestFile()
  const contexts = getContextsMap()

  // Try exact file path first
  const ctx = contexts.get(filePath)
  if (ctx) {
    return ctx
  }

  // If not found and we didn't already check the fallback key, try it
  // This handles the case where context was stored under a different key
  // than what the current stack trace detection returns
  if (filePath !== UNKNOWN_TEST_FILE) {
    const fallbackCtx = contexts.get(UNKNOWN_TEST_FILE)
    if (fallbackCtx) {
      debugLog(
        'Using fallback context (UNKNOWN_TEST_FILE) for file: %s',
        filePath
      )
      return fallbackCtx
    }
  }

  return undefined
}

/**
 * Get the test database instance for the current file.
 */
export function getTestDb(): PostgresJsDatabase {
  const ctx = getCurrentContext()
  if (!ctx?.db) {
    throw new Error(
      'Test DB not initialized for this file. Ensure beforeAll completed.'
    )
  }
  return ctx.db
}

/**
 * Start the outer transaction for a test file.
 * Call this in beforeAll.
 *
 * This creates a dedicated connection for this file and starts a transaction.
 * All tests in this file will use this connection.
 *
 * When using the shared context key (UNKNOWN_TEST_FILE), the context is shared
 * across all files. We check if an existing context is still valid (has an
 * active transaction) and reuse or recreate it as needed.
 */
export async function beginOuterTransaction(): Promise<void> {
  const filePath = getCurrentTestFile()
  debugLog('beginOuterTransaction for file: %s', filePath)

  // Check if this file already has a context
  const existingCtx = getContextsMap().get(filePath)
  if (existingCtx) {
    // Context exists - check if it's still valid (has an active transaction)
    debugLog(
      'beginOuterTransaction: existing context found, inTransaction=%s, savepointCounter=%d',
      existingCtx.inTransaction,
      existingCtx.savepointCounter
    )
    if (existingCtx.inTransaction) {
      debugLog(
        'Context already exists and is valid for file, reusing: %s',
        filePath
      )
      return
    }

    // Context exists but transaction is not active - it was cleaned up
    // by another file's afterAll. Remove it and recreate below.
    debugLog(
      'Context exists but transaction is not active, recreating: %s',
      filePath
    )
    try {
      await existingCtx.connection.end()
    } catch {
      // Connection might already be closed, ignore
    }
    getContextsMap().delete(filePath)
  }

  // Create a dedicated connection for this file
  // Each file gets its own connection so they can run in parallel
  debugLog('Creating dedicated postgres connection for: %s', filePath)
  const connection = postgres(getConnectionString(), {
    max: 1, // Single connection for this file
    idle_timeout: 0,
    connect_timeout: 10,
    onnotice: () => {}, // Suppress notice messages
  })

  // Create drizzle instance
  const db = drizzle(connection, { logger: false })

  // Create the file context
  const ctx: FileTestContext = {
    connection,
    db,
    currentSavepoint: null,
    savepointCounter: 0,
    inTransaction: false,
  }

  // Store context in map keyed by file path
  getContextsMap().set(filePath, ctx)
  debugLog(
    'Stored context in map. Total contexts: %d',
    getContextsMap().size
  )

  // Start the outer transaction
  await connection`BEGIN`
  ctx.inTransaction = true

  // Verify the transaction is actually active
  try {
    const [result] =
      await connection`SELECT pg_current_xact_id_if_assigned() as txid`
    debugLog(
      'Outer transaction started for: %s (txid=%s)',
      filePath,
      result?.txid ?? 'null - WARNING: transaction may not be active!'
    )
  } catch (error) {
    debugLog(
      'Outer transaction verification failed: %s',
      error instanceof Error ? error.message : String(error)
    )
  }
}

/**
 * Create a savepoint for the current test.
 * Call this in beforeEach.
 */
export async function beginTestTransaction(): Promise<void> {
  const ctx = getCurrentContext()
  if (!ctx) {
    // Log more info for debugging
    const filePath = getCurrentTestFile()
    const availableKeys = Array.from(getContextsMap().keys()).join(
      ', '
    )
    debugLog(
      'No context found for file: %s. Available: [%s]',
      filePath,
      availableKeys
    )
    throw new Error(
      `No test context for file: ${filePath}. Available contexts: [${availableKeys}]. ` +
        'Ensure beforeAll ran beginOuterTransaction.'
    )
  }

  debugLog(
    'beginTestTransaction: ctx.inTransaction=%s, savepointCounter=%d',
    ctx.inTransaction,
    ctx.savepointCounter
  )

  // Verify actual PostgreSQL transaction state before proceeding
  // Use txid_current_if_assigned() which returns null if no txid assigned yet,
  // but more importantly test if we can create a savepoint (which only works in transactions)
  try {
    // Try to create and immediately release a test savepoint - this will fail if not in a transaction
    await ctx.connection`SAVEPOINT __test_txn_check__`
    await ctx.connection`RELEASE SAVEPOINT __test_txn_check__`
    debugLog(
      'PostgreSQL transaction check: PASSED (savepoint test successful)'
    )
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    debugLog(
      'PostgreSQL transaction check: FAILED (%s)',
      errorMessage
    )
    if (
      errorMessage.includes(
        'SAVEPOINT can only be used in transaction'
      )
    ) {
      debugLog('Transaction was terminated externally, restarting...')
      ctx.inTransaction = false
    }
  }

  // Ensure we're in a transaction - always start one if not active
  if (!ctx.inTransaction) {
    debugLog('Starting new transaction (was not in transaction)')
    await ctx.connection`BEGIN`
    ctx.inTransaction = true
  }

  ctx.savepointCounter++
  const name = `sp_${ctx.savepointCounter}`
  debugLog(
    'Creating savepoint: %s (counter: %d)',
    name,
    ctx.savepointCounter
  )
  await ctx.connection`SAVEPOINT ${ctx.connection.unsafe(name)}`
  ctx.currentSavepoint = name
}

/**
 * Rollback to the savepoint created in beginTestTransaction.
 * Call this in afterEach.
 */
export async function rollbackTestTransaction(): Promise<void> {
  const ctx = getCurrentContext()
  if (!ctx || !ctx.currentSavepoint) {
    debugLog(
      'No savepoint to rollback (ctx: %s, savepoint: %s)',
      !!ctx,
      ctx?.currentSavepoint
    )
    return
  }

  const savepointName = ctx.currentSavepoint
  ctx.currentSavepoint = null
  debugLog('Rolling back to savepoint: %s', savepointName)

  try {
    await ctx.connection`ROLLBACK TO SAVEPOINT ${ctx.connection.unsafe(savepointName)}`
    await ctx.connection`RELEASE SAVEPOINT ${ctx.connection.unsafe(savepointName)}`
    debugLog('Savepoint rollback successful: %s', savepointName)
  } catch (error) {
    // Transaction was likely aborted, rollback and mark as not in transaction
    debugLog(
      'Savepoint rollback failed (likely aborted transaction), performing full rollback. Error: %s',
      error instanceof Error ? error.message : String(error)
    )
    try {
      await ctx.connection`ROLLBACK`
      debugLog('Full rollback successful')
    } catch (rollbackError) {
      debugLog(
        'Full rollback also failed: %s',
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError)
      )
    }
    ctx.inTransaction = false
  }
}

/**
 * Rollback the outer transaction and close the connection.
 * Call this in afterAll.
 *
 * Uses the same fallback logic as getCurrentContext() to handle cases
 * where the stack trace detection returns a different key during cleanup
 * than was used when storing the context.
 *
 * IMPORTANT: When using the shared context key (UNKNOWN_TEST_FILE), we
 * do NOT clean up because other test files may still need it. The shared
 * context will be cleaned up when the process exits.
 */
export async function cleanupTestDb(): Promise<void> {
  const filePath = getCurrentTestFile()
  const contexts = getContextsMap()

  // Try exact file path first, then fallback to UNKNOWN_TEST_FILE
  let ctx = contexts.get(filePath)
  let actualKey = filePath

  if (!ctx && filePath !== UNKNOWN_TEST_FILE) {
    ctx = contexts.get(UNKNOWN_TEST_FILE)
    if (ctx) {
      actualKey = UNKNOWN_TEST_FILE
      debugLog(
        'cleanupTestDb using fallback key UNKNOWN_TEST_FILE for file: %s',
        filePath
      )
    }
  }

  debugLog(
    'cleanupTestDb for file: %s (actual key: %s, has context: %s)',
    filePath,
    actualKey,
    !!ctx
  )

  if (!ctx) {
    debugLog('No context found for cleanup, skipping')
    return
  }

  // When using the shared context key, don't clean up - other files may need it.
  // The connection will be cleaned up when the process exits.
  if (actualKey === UNKNOWN_TEST_FILE) {
    debugLog(
      'Skipping cleanup for shared context (UNKNOWN_TEST_FILE) - other files may use it'
    )
    return
  }

  // Rollback the outer transaction
  if (ctx.inTransaction) {
    debugLog('Rolling back outer transaction')
    try {
      await ctx.connection`ROLLBACK`
      debugLog('Outer transaction rollback successful')
    } catch (error) {
      debugLog(
        'Outer transaction rollback failed: %s',
        error instanceof Error ? error.message : String(error)
      )
    }
    ctx.inTransaction = false
  }

  // Close the connection
  debugLog('Closing connection')
  try {
    await ctx.connection.end()
    debugLog('Connection closed successfully')
  } catch (error) {
    debugLog(
      'Connection close failed: %s',
      error instanceof Error ? error.message : String(error)
    )
  }

  // Remove from map using the actual key we found the context under
  contexts.delete(actualKey)
  debugLog(
    'Context removed (key: %s). Remaining contexts: %d',
    actualKey,
    contexts.size
  )
}
