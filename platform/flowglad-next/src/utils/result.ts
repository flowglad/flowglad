/**
 * Result Monad for explicit error handling
 *
 * Instead of throwing exceptions, functions return Result<T, E> which is either:
 * - { result: T } for success
 * - { error: E } for failure
 *
 * Use doResult() to chain operations that return Results, with automatic
 * short-circuiting on the first error.
 */

/**
 * A Result is either a success containing { result: T } or a failure containing { error: E }
 */
export type Result<T, E = Error> = { result: T } | { error: E }

/**
 * Type guard to check if a Result is a success
 */
export function isOk<T, E>(r: Result<T, E>): r is { result: T } {
  return 'result' in r
}

/**
 * Type guard to check if a Result is a failure
 */
export function isErr<T, E>(r: Result<T, E>): r is { error: E } {
  return 'error' in r
}

/**
 * Construct a success Result
 */
export function ok<T>(value: T): { result: T } {
  return { result: value }
}

/**
 * Construct a failure Result
 */
export function err<E>(error: E): { error: E } {
  return { error }
}

/**
 * Chain multiple operations that return Results.
 * Short-circuits on the first error encountered.
 *
 * @param initial - The starting Result or Promise<Result>
 * @param fns - Functions that take the previous result value and return a new Result
 * @returns The final Result, or the first error encountered
 *
 * @example
 * const result = await doResult(
 *   ok(input),
 *   validateInput,
 *   processData,
 *   saveToDatabase
 * )
 */
export async function doResult<T, E>(
  initial: Result<T, E> | Promise<Result<T, E>>,
  ...fns: Array<
    (prev: any) => Result<any, E> | Promise<Result<any, E>>
  >
): Promise<Result<any, E>> {
  let current = await initial
  if (isErr(current)) return current

  for (const fn of fns) {
    current = await fn(current.result)
    if (isErr(current)) return current
  }

  return current
}

/**
 * Unwrap a Result, throwing the error if it's a failure.
 * Use at API boundaries to convert back to exception-based control flow.
 *
 * @param result - The Result to unwrap
 * @returns The success value
 * @throws The error if result is a failure
 */
export function unwrapOrThrow<T, E extends Error>(
  result: Result<T, E>
): T {
  if (isErr(result)) throw result.error
  return result.result
}
