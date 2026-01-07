/**
 * Generic Function Combinators
 *
 * A minimal library of function combinators for composing async functions.
 * These are domain-agnostic building blocks used by tracing.ts and available
 * for other cross-cutting concerns.
 *
 * ## Combinators
 * - `identity` - Returns function unchanged
 * - `wrap` - Bracket a function with setup/teardown logic
 * - `withContext` - Inject a capability into a function
 * - `tap` - Apply side-effect to result without modifying it
 * - `when` - Conditionally apply a transformation
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Any async function.
 */
export type AsyncFn<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>

/**
 * A function transformer - takes a function and returns a modified version.
 */
export type Transformer<TArgs extends unknown[], TResult> = (
  fn: AsyncFn<TArgs, TResult>
) => AsyncFn<TArgs, TResult>

// ============================================================================
// Basic Combinators
// ============================================================================

/**
 * Identity combinator - returns the function unchanged.
 *
 * Useful as a no-op in conditional transformations or as a default.
 *
 * @example
 * ```ts
 * const maybeTrace = shouldTrace ? traced(config) : identity
 * const fn = maybeTrace(myFunction)
 * ```
 */
export function identity<TArgs extends unknown[], TResult>(
  fn: AsyncFn<TArgs, TResult>
): AsyncFn<TArgs, TResult> {
  return fn
}

/**
 * Conditionally apply a transformation.
 *
 * @param condition - Whether to apply the transformation
 * @param transform - The transformation to apply if condition is true
 * @returns A transformer that applies transform only when condition is true
 *
 * @example
 * ```ts
 * const maybeLogged = when(DEBUG, logged('myFn'))
 * const fn = maybeLogged(myFunction)
 * ```
 */
export function when<TArgs extends unknown[], TResult>(
  condition: boolean,
  transform: Transformer<TArgs, TResult>
): Transformer<TArgs, TResult> {
  return condition ? transform : identity
}

// ============================================================================
// Wrapping Combinators
// ============================================================================

/**
 * Configuration for the wrap combinator.
 */
export interface WrapConfig<
  TArgs extends unknown[],
  TResult,
  TContext,
> {
  /** Called before the function executes. Returns context passed to after. */
  before: (...args: TArgs) => TContext | Promise<TContext>

  /** Called after the function executes (success or failure). */
  after: (
    context: TContext,
    result:
      | { success: true; value: TResult }
      | { success: false; error: unknown }
  ) => void | Promise<void>
}

/**
 * Wrap a function with before/after logic (bracket pattern).
 *
 * The `before` function runs before execution and returns a context.
 * The `after` function runs after execution (success or failure) with the context.
 *
 * @example
 * ```ts
 * const timed = wrap({
 *   before: () => Date.now(),
 *   after: (startTime, result) => {
 *     console.log(`Took ${Date.now() - startTime}ms, success: ${result.success}`)
 *   }
 * })
 *
 * const timedFetch = timed(fetchData)
 * ```
 */
export function wrap<TArgs extends unknown[], TResult, TContext>(
  config: WrapConfig<TArgs, TResult, TContext>
): Transformer<TArgs, TResult> {
  return (fn) =>
    async (...args) => {
      const context = await config.before(...args)
      try {
        const value = await fn(...args)
        await config.after(context, { success: true, value })
        return value
      } catch (error) {
        await config.after(context, { success: false, error })
        throw error
      }
    }
}

/**
 * Simpler wrap variant for success-only side effects.
 *
 * @example
 * ```ts
 * const logged = wrapSuccess({
 *   before: (id) => console.log(`Starting ${id}`),
 *   after: (_, result) => console.log(`Got ${result}`)
 * })
 * ```
 */
export function wrapSuccess<
  TArgs extends unknown[],
  TResult,
  TContext,
>(config: {
  before: (...args: TArgs) => TContext | Promise<TContext>
  after: (context: TContext, result: TResult) => void | Promise<void>
}): Transformer<TArgs, TResult> {
  return (fn) =>
    async (...args) => {
      const context = await config.before(...args)
      const result = await fn(...args)
      await config.after(context, result)
      return result
    }
}

// ============================================================================
// Context Injection Combinators
// ============================================================================

/**
 * Inject a capability/context as the first argument to a function.
 *
 * The returned function has the context argument hidden from callers.
 * Useful for dependency injection patterns.
 *
 * @param createContext - Factory that creates the context for each call
 * @param fn - Function that receives context as first argument
 * @returns Function with context argument removed from signature
 *
 * @example
 * ```ts
 * // Function that needs a logger
 * const fetchWithLogging = async (log: Logger, url: string) => {
 *   log.info(`Fetching ${url}`)
 *   const result = await fetch(url)
 *   log.info(`Got ${result.status}`)
 *   return result
 * }
 *
 * // Create version with logger injected
 * const fetchData = withContext(
 *   () => createLogger('fetch'),
 *   fetchWithLogging
 * )
 *
 * // Call without passing logger
 * await fetchData('https://api.example.com')
 * ```
 */
export function withContext<
  TContext,
  TArgs extends unknown[],
  TResult,
>(
  createContext: (...args: TArgs) => TContext | Promise<TContext>,
  fn: (context: TContext, ...args: TArgs) => Promise<TResult>
): AsyncFn<TArgs, TResult> {
  return async (...args) => {
    const context = await createContext(...args)
    return fn(context, ...args)
  }
}

// ============================================================================
// Side Effect Combinators
// ============================================================================

/**
 * Apply a side effect to the result without modifying it.
 *
 * @example
 * ```ts
 * const loggedFetch = tap(
 *   (result) => console.log(`Fetched ${result.length} items`),
 *   fetchItems
 * )
 * ```
 */
export function tap<TArgs extends unknown[], TResult>(
  effect: (result: TResult, ...args: TArgs) => void | Promise<void>,
  fn: AsyncFn<TArgs, TResult>
): AsyncFn<TArgs, TResult> {
  return async (...args) => {
    const result = await fn(...args)
    await effect(result, ...args)
    return result
  }
}

/**
 * Apply a side effect to the arguments before execution.
 *
 * @example
 * ```ts
 * const loggedFetch = tapArgs(
 *   (url) => console.log(`Fetching ${url}`),
 *   fetchData
 * )
 * ```
 */
export function tapArgs<TArgs extends unknown[], TResult>(
  effect: (...args: TArgs) => void | Promise<void>,
  fn: AsyncFn<TArgs, TResult>
): AsyncFn<TArgs, TResult> {
  return async (...args) => {
    await effect(...args)
    return fn(...args)
  }
}
