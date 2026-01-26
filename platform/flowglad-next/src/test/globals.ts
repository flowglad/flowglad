/**
 * Consolidated Global Declarations for Test Infrastructure
 *
 * All test-related global variables should be declared here to:
 * 1. Avoid duplicate declarations across setup files
 * 2. Ensure TypeScript type consistency
 * 3. Document the purpose of each global
 *
 * IMPORTANT: These globals are managed by the test setup files.
 * Do not modify them directly in test code unless documented.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Sql } from 'postgres'

/**
 * Context for a single test file's database isolation.
 * Each *.db.test.ts file gets its own dedicated connection with
 * an outer transaction for savepoint-based isolation.
 */
export interface FileTestContext {
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

declare global {
  // eslint-disable-next-line no-var
  /**
   * Mocked auth session for testing.
   * Set by tests to control what getSession() returns.
   * Automatically reset to null after each test by globalStateGuard.
   */
  var __mockedAuthSession:
    | null
    | { user: { id: string; email: string } }
    | undefined

  // eslint-disable-next-line no-var
  /**
   * Map of test file paths to their database isolation contexts.
   * Used by transactionIsolation.ts to manage per-file connections.
   * Keyed by the full file path from stack trace detection.
   */
  var __testContexts: Map<string, FileTestContext> | undefined
}

// Ensure this file is treated as a module
export {}
