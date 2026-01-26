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

  // Check if this file already has a context
  const existingCtx = getContextsMap().get(filePath)
  if (existingCtx) {
    // Context exists - check if it's still valid (has an active transaction)
    if (existingCtx.inTransaction) {
      return
    }

    // Context exists but transaction is not active - it was cleaned up
    // by another file's afterAll. Remove it and recreate below.
    try {
      await existingCtx.connection.end()
    } catch {
      // Connection might already be closed, ignore
    }
    getContextsMap().delete(filePath)
  }

  // Create a dedicated connection for this file
  // Each file gets its own connection so they can run in parallel
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

  // Start the outer transaction
  await connection`BEGIN`
  ctx.inTransaction = true
}

/**
 * Create a savepoint for the current test.
 * Call this in beforeEach.
 */
export async function beginTestTransaction(): Promise<void> {
  const ctx = getCurrentContext()
  if (!ctx) {
    const filePath = getCurrentTestFile()
    const availableKeys = Array.from(getContextsMap().keys()).join(
      ', '
    )
    throw new Error(
      `No test context for file: ${filePath}. Available contexts: [${availableKeys}]. ` +
        'Ensure beforeAll ran beginOuterTransaction.'
    )
  }

  // Verify actual PostgreSQL transaction state before proceeding
  // Test if we can create a savepoint (which only works in transactions)
  try {
    await ctx.connection`SAVEPOINT __test_txn_check__`
    await ctx.connection`RELEASE SAVEPOINT __test_txn_check__`
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    if (
      errorMessage.includes(
        'SAVEPOINT can only be used in transaction'
      )
    ) {
      ctx.inTransaction = false
    }
  }

  // Ensure we're in a transaction - always start one if not active
  if (!ctx.inTransaction) {
    await ctx.connection`BEGIN`
    ctx.inTransaction = true
  }

  ctx.savepointCounter++
  const name = `sp_${ctx.savepointCounter}`
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
    return
  }

  const savepointName = ctx.currentSavepoint
  ctx.currentSavepoint = null

  try {
    await ctx.connection`ROLLBACK TO SAVEPOINT ${ctx.connection.unsafe(savepointName)}`
    await ctx.connection`RELEASE SAVEPOINT ${ctx.connection.unsafe(savepointName)}`
  } catch {
    // Transaction was likely aborted, rollback and mark as not in transaction
    try {
      await ctx.connection`ROLLBACK`
    } catch {
      // Ignore rollback errors
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
    }
  }

  if (!ctx) {
    return
  }

  // When using the shared context key, don't clean up - other files may need it.
  // The connection will be cleaned up when the process exits.
  if (actualKey === UNKNOWN_TEST_FILE) {
    return
  }

  // Rollback the outer transaction
  if (ctx.inTransaction) {
    try {
      await ctx.connection`ROLLBACK`
    } catch {
      // Ignore rollback errors
    }
    ctx.inTransaction = false
  }

  // Close the connection
  try {
    await ctx.connection.end()
  } catch {
    // Ignore connection close errors
  }

  // Remove from map using the actual key we found the context under
  contexts.delete(actualKey)
}
