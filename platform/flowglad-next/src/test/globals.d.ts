/**
 * Global type declarations for test infrastructure.
 *
 * This file provides TypeScript types for the test isolation system.
 * It is NOT gitignored (exception in root .gitignore).
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type postgres from 'postgres'

/**
 * Context for per-file database transaction isolation.
 * Each test file gets its own connection and outer transaction.
 * Tests within a file use savepoints for isolation.
 */
export interface FileTestContext {
  /** The raw postgres connection for this file */
  connection: postgres.Sql
  /** The drizzle database instance */
  db: PostgresJsDatabase
  /** Current savepoint name (null if no savepoint active) */
  currentSavepoint: string | null
  /** Counter for generating unique savepoint names */
  savepointCounter: number
  /** Whether we're currently in a transaction */
  inTransaction: boolean
}

declare global {
  /**
   * Mocked auth session for testing.
   * Set this in tests to control what getSession() returns.
   */
  // eslint-disable-next-line no-var
  var __mockedAuthSession:
    | null
    | { user: { id: string; email: string } }
    | undefined

  /**
   * Map of test file paths to their database contexts.
   */
  // eslint-disable-next-line no-var
  var __testContexts: Map<string, FileTestContext> | undefined
}

export {}
