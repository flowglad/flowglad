import type { Err, Ok, Result } from 'better-result'

/**
 * Extracts the value from a Result, or throws the original error.
 *
 * Unlike better-result's `.unwrap()` which wraps errors in a Panic,
 * this function throws the original error directly, preserving
 * TRPCError types and other error properties.
 *
 * Use this at API boundaries where you want to convert Result<T, E> to T.
 *
 * @example
 * ```ts
 * const result = await someResultReturningFunction()
 * const value = unwrapOrThrow(result)
 * ```
 */
export function unwrapOrThrow<T, E extends Error>(
  result: Result<T, E>
): T {
  if (result.status === 'error') {
    // biome-ignore lint/plugin: Re-throw unexpected errors after handling known error types
    throw result.error
  }
  return result.value
}

/**
 * Type guard to check if a Result is Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T, E> {
  return result.status === 'ok'
}

/**
 * Type guard to check if a Result is Err
 */
export function isErr<T, E>(
  result: Result<T, E>
): result is Err<T, E> {
  return result.status === 'error'
}
