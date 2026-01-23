/**
 * Per-Test Transaction Isolation
 *
 * Provides savepoint-based transaction isolation for DB-backed tests.
 * Each test runs within a savepoint that is rolled back after the test,
 * ensuring tests don't affect each other's data.
 *
 * This is used by bun.dbtest.setup.ts to automatically wrap each test
 * in a transaction that rolls back.
 *
 * Note: This uses PostgreSQL savepoints which work within an existing transaction.
 * The database must be seeded BEFORE the first test runs (in beforeAll),
 * and then each test creates a savepoint that gets rolled back.
 */

import { sql } from 'drizzle-orm'
import db from '@/db/client'

let currentSavepoint: string | null = null
let savepointCounter = 0

/**
 * Begins a new savepoint for test isolation.
 * Call this in beforeEach to start a clean transaction scope.
 *
 * Each test gets a unique savepoint name to prevent conflicts.
 */
export async function beginTestTransaction(): Promise<void> {
  savepointCounter++
  const name = `test_savepoint_${savepointCounter}_${Date.now()}`
  await db.execute(sql.raw(`SAVEPOINT ${name}`))
  currentSavepoint = name
}

/**
 * Rolls back to the savepoint created in beginTestTransaction.
 * Call this in afterEach to undo all changes made during the test.
 *
 * This releases the savepoint after rolling back to free resources.
 */
export async function rollbackTestTransaction(): Promise<void> {
  if (currentSavepoint) {
    try {
      await db.execute(
        sql.raw(`ROLLBACK TO SAVEPOINT ${currentSavepoint}`)
      )
      await db.execute(
        sql.raw(`RELEASE SAVEPOINT ${currentSavepoint}`)
      )
    } catch (error) {
      // Savepoint may already be released if transaction was aborted
      // This is expected in some error scenarios
      console.warn(
        `Warning: Could not rollback savepoint ${currentSavepoint}:`,
        error
      )
    }
    currentSavepoint = null
  }
}

/**
 * Gets the current savepoint name (for debugging).
 */
export function getCurrentSavepoint(): string | null {
  return currentSavepoint
}

/**
 * Resets the savepoint counter (useful for test suite cleanup).
 */
export function resetSavepointCounter(): void {
  savepointCounter = 0
  currentSavepoint = null
}
