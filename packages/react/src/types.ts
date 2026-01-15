/**
 * Standardized error type for Flowglad hooks.
 */
export interface FlowgladError {
  message: string
  status?: number
  code?: string
}

/**
 * Standardized return type for Flowglad hooks.
 * Inspired by Better Auth's `useSession()` pattern.
 *
 * @typeParam TData - The type of data returned by the hook
 * @typeParam TRefetchParams - The type of parameters accepted by the refetch function (defaults to void)
 */
export interface FlowgladHookData<TData, TRefetchParams = void> {
  /**
   * The fetched data or null if not yet loaded or on error.
   */
  data: TData | null
  /**
   * True during initial load (no data yet).
   */
  isPending: boolean
  /**
   * True when refetching (has stale data available).
   */
  isRefetching: boolean
  /**
   * Standardized error object or null if no error occurred.
   */
  error: FlowgladError | null
  /**
   * Function to manually trigger a refetch.
   */
  refetch: (params?: TRefetchParams) => void
}
