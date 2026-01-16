/**
 * Success variant of the Result type.
 */
export interface TransactionOutput<T> {
  result: T
}

/**
 * Error variant of the Result type.
 */
export interface TransactionError {
  error: Error
}

/**
 * Result type for transaction functions.
 * Can represent either a successful result or an error.
 */
export type Result<T> = TransactionOutput<T> | TransactionError

/**
 * Type guard to check if a Result is successful.
 */
export function isSuccess<T>(
  result: Result<T>
): result is TransactionOutput<T> {
  return 'result' in result
}

/**
 * Type guard to check if a Result is an error.
 */
export function isError<T>(
  result: Result<T>
): result is TransactionError {
  return 'error' in result
}
