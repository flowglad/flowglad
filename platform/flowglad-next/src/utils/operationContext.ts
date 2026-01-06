import { withRequestContext } from '@query-doctor/sqlcommenter-drizzle/http'
import { AsyncLocalStorage } from 'async_hooks'

interface OperationContext {
  /** The operation name for database query labeling (e.g., "customers.create") */
  operationName: string
}

/**
 * Our own AsyncLocalStorage for tracking operation names.
 * Used by getCurrentOperationName() to return the current operation.
 */
const operationContextStorage =
  new AsyncLocalStorage<OperationContext>()

/**
 * Runs a function with an operation context set.
 * The operation name will be available to all async operations within the callback,
 * and will be automatically added as a 'route' tag to SQL query comments by
 * the sqlcommenter-drizzle library.
 */
export function withOperationContext<T>(
  operationName: string,
  fn: () => T
): T {
  // Nest both context stores - our own for getCurrentOperationName()
  // and the library's for SQL comment injection
  return operationContextStorage.run({ operationName }, () => {
    // The library's withRequestContext doesn't return the result of the callback,
    // so we capture it manually while still setting up the library's context
    let result: T
    withRequestContext({ route: operationName }, async () => {
      result = fn()
    })
    return result!
  })
}

/**
 * Gets the current operation name from context, if available.
 * Returns undefined if called outside of an operation context.
 */
export function getCurrentOperationName(): string | undefined {
  return operationContextStorage.getStore()?.operationName
}
