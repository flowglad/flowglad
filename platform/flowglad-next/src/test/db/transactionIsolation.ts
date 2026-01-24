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
import postgres, { type Sql } from 'postgres'

// Global type declaration for test contexts map
declare global {
  // eslint-disable-next-line no-var
  var __testContexts: Map<string, FileTestContext> | undefined
}

/**
 * Context for a single test file's database isolation.
 */
interface FileTestContext {
  /** Dedicated connection for this file */
  connection: Sql
  /** Drizzle instance on the connection */
  db: PostgresJsDatabase
  /** Current savepoint name (if any) */
  currentSavepoint: string | null
  /** Savepoint counter for unique names */
  savepointCounter: number
  /** Whether we're in an active transaction */
  inTransaction: boolean
}

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
 * Get the current test file path from the stack trace.
 * This is the most reliable way to identify which file's context to use.
 */
function getCurrentTestFile(): string {
  const stack = new Error().stack || ''
  const lines = stack.split('\n')

  // Find the first line that contains a .dbtest.ts file
  for (const line of lines) {
    const match = line.match(/\(([^)]+\.dbtest\.ts)/)
    if (match) {
      return match[1]
    }
    // Also check for format without parentheses
    const match2 = line.match(/at\s+([^\s]+\.dbtest\.ts)/)
    if (match2) {
      return match2[1]
    }
  }

  // Fallback: use the setup file indicator
  return 'unknown_test_file'
}

/**
 * Get the current file's test context.
 */
function getCurrentContext(): FileTestContext | undefined {
  const filePath = getCurrentTestFile()
  return getContextsMap().get(filePath)
}

/**
 * Initialize a new test context for a file.
 * Call this in beforeAll. This is a no-op now, actual init happens in beginOuterTransaction.
 */
export async function initializeTestDb(): Promise<void> {
  // No-op - actual initialization happens in beginOuterTransaction
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
 * Call this in beforeAll after initializeTestDb().
 *
 * This creates a dedicated connection for this file and starts a transaction.
 * All tests in this file will use this connection.
 */
export async function beginOuterTransaction(): Promise<void> {
  const filePath = getCurrentTestFile()

  // Check if this file already has a context (shouldn't happen, but be safe)
  if (getContextsMap().has(filePath)) {
    return
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
    // Log more info for debugging
    const filePath = getCurrentTestFile()
    const availableKeys = Array.from(getContextsMap().keys()).join(
      ', '
    )
    throw new Error(
      `No test context for file: ${filePath}. Available contexts: [${availableKeys}]. ` +
        'Ensure beforeAll ran beginOuterTransaction.'
    )
  }

  // Ensure we're in a transaction
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
      // Ignore
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

  if (!ctx) {
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
    // Ignore close errors
  }

  // Remove from map
  getContextsMap().delete(filePath)
}

/**
 * Reset the savepoint counter (useful for debugging).
 */
export function resetSavepointCounter(): void {
  const ctx = getCurrentContext()
  if (ctx) {
    ctx.savepointCounter = 0
  }
}
