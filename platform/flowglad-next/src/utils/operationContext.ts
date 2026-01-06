import { AsyncLocalStorage } from 'async_hooks'

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
