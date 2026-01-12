import type Flowglad from '@flowglad/node'

import type { Subscription } from '@flowglad/shared'

export type SubscriptionCardSubscription = Pick<
  Subscription,
  | 'id'
  | 'trialEnd'
  | 'status'
  | 'cancelScheduledAt'
  | 'currentBillingPeriodEnd'
  | 'interval'
  | 'intervalCount'
  | 'canceledAt'
>

export type SubscriptionCardSubscriptionItem = Pick<
  Flowglad.StandardSubscriptionDetails.SubscriptionItem,
  'id' | 'unitPrice' | 'quantity' | 'price'
>

/**
 * Standardized error type for Flowglad hooks.
 */
export interface FlowgladError {
  message: string
  status?: number
  code?: string
}

/**
 * Standardized return type for Flowglad hooks, inspired by Better Auth's useSession() pattern.
 * Provides consistent API across all hooks.
 *
 * @template TData - The type of data returned by the hook
 * @template TRefetchParams - The type of parameters accepted by the refetch function (defaults to void)
 */
export interface FlowgladHookData<TData, TRefetchParams = void> {
  /** The fetched data or null if not yet loaded/error occurred */
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
