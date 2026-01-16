import { AsyncLocalStorage } from 'async_hooks'
import type { TransactionContext } from '@/utils/cache'

const transactionContextStorage =
  new AsyncLocalStorage<TransactionContext>()

/**
 * Runs a function within a transaction context.
 * The context is available to any code called within the function
 * via getCurrentTransactionContext().
 *
 * Used by transaction wrappers to make the transaction context
 * available to cached functions for storing recomputation metadata.
 */
export function runWithTransactionContext<T>(
  context: TransactionContext,
  fn: () => T
): T {
  return transactionContextStorage.run(context, fn)
}

/**
 * Gets the current transaction context if one is active.
 * Returns undefined if called outside of a transaction context.
 *
 * Used by cachedRecomputable() to capture the transaction context
 * for storing recomputation metadata.
 */
export function getCurrentTransactionContext():
  | TransactionContext
  | undefined {
  return transactionContextStorage.getStore()
}
