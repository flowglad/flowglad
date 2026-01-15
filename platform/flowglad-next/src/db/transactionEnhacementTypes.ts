/**
 * Success variant for transaction functions that need to return additional metadata.
 * This is kept for backwards compatibility with existing code that returns { result: T }.
 * New code should use `Result` from 'better-result' instead.
 */
export interface TransactionOutput<T> {
  result: T
}
