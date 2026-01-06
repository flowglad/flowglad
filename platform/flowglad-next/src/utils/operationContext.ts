import { AsyncLocalStorage } from 'async_hooks'
import { sql } from 'drizzle-orm'
import type { DbTransaction } from '@/db/types'

interface OperationContext {
  /** The operation name for database query labeling (e.g., "customers.create") */
  operationName: string
}

/**
 * AsyncLocalStorage for propagating operation context through async call chains.
 * Used to automatically label database queries with the originating operation.
 */
export const operationContextStorage =
  new AsyncLocalStorage<OperationContext>()

/**
 * Gets the current operation name from context, if available.
 * Returns undefined if called outside of an operation context.
 */
export function getCurrentOperationName(): string | undefined {
  return operationContextStorage.getStore()?.operationName
}

/**
 * Runs a function with an operation context set.
 * The operation name will be available to all async operations within the callback.
 */
export function withOperationContext<T>(
  operationName: string,
  fn: () => T
): T {
  return operationContextStorage.run({ operationName }, fn)
}

/**
 * Sets the app.operation config variable for the current transaction.
 * This labels all queries within the transaction for easier debugging in pg_stat_statements.
 * Automatically reads the operation name from the current async context.
 */
export async function setTransactionOperationLabel(
  transaction: DbTransaction
): Promise<void> {
  const operationName = getCurrentOperationName()
  if (operationName) {
    await transaction.execute(
      sql`SELECT set_config('app.operation', ${operationName}, TRUE)`
    )
  }
}
