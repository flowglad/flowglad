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
import { getCurrentTestFile } from '@/test/db/testFileDetection'
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
 */
function getCurrentContext(): FileTestContext | undefined {
  const filePath = getCurrentTestFile()
  return getContextsMap().get(filePath)
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
 */
export async function beginOuterTransaction(): Promise<void> {
  const filePath = getCurrentTestFile()
  debugLog('beginOuterTransaction for file: %s', filePath)

  // Check if this file already has a context (shouldn't happen, but be safe)
  if (getContextsMap().has(filePath)) {
    debugLog(
      'Context already exists for file, skipping: %s',
      filePath
    )
    return
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
  debugLog('Outer transaction started for: %s', filePath)
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

  // Ensure we're in a transaction
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
 */
export async function cleanupTestDb(): Promise<void> {
  const filePath = getCurrentTestFile()
  const ctx = getContextsMap().get(filePath)
  debugLog(
    'cleanupTestDb for file: %s (has context: %s)',
    filePath,
    !!ctx
  )

  if (!ctx) {
    debugLog('No context found for cleanup, skipping')
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

  // Remove from map
  getContextsMap().delete(filePath)
  debugLog(
    'Context removed. Remaining contexts: %d',
    getContextsMap().size
  )
}
