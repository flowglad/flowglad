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
 * Sets the operation label for the current transaction for debugging slow queries.
 *
 * Sets two PostgreSQL variables:
 * 1. `application_name` - Visible in pg_stat_activity and pg_stat_statements
 * 2. `app.operation` - Custom config variable for additional context
 *
 * The application_name appears in pg_stat_statements, making it easy to correlate
 * slow queries with the business operation that generated them.
 *
 * Automatically reads the operation name from the current async context.
 */
export async function setTransactionOperationLabel(
  transaction: DbTransaction
): Promise<void> {
  const operationName = getCurrentOperationName()
  if (operationName) {
    // Sanitize operation name to prevent SQL injection (only allow alphanumeric, dots, underscores)
    const sanitizedName = operationName.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    )
    const appName = `flowglad:${sanitizedName}`

    // Set application_name - this shows up in pg_stat_activity and helps with debugging
    // Using SET LOCAL so it only affects this transaction
    // Note: SET doesn't support parameterized values, so we use sql.raw with sanitized input
    await transaction.execute(
      sql`SET LOCAL application_name = '${sql.raw(appName)}'`
    )

    // Also set custom config for additional context if needed
    await transaction.execute(
      sql`SELECT set_config('app.operation', ${operationName}, TRUE)`
    )
  }
}
