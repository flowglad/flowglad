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
 * Inspired by Better Auth's useSession() return signature.
 *
 * @typeParam TData - The type of data returned by the hook
 * @typeParam TRefetchParams - Optional parameters for the refetch function
 */
export interface FlowgladHookData<TData, TRefetchParams = void> {
  /** The fetched data or null if not yet loaded or on error */
  data: TData | null
  /** True during initial load when no data is available yet */
  isPending: boolean
  /** True when refetching with stale data available */
  isRefetching: boolean
  /** Standardized error object or null if no error */
  error: FlowgladError | null
  /** Function to manually trigger a refetch */
  refetch: (params?: TRefetchParams) => void
}
