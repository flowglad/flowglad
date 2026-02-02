'use client'
import {
  type AdjustSubscriptionParams,
  type CancelSubscriptionParams,
  FlowgladActionKey,
  type SubscriptionDetails,
  type UncancelSubscriptionParams,
} from '@flowglad/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { getFlowgladRoute } from './FlowgladContext'
import { invalidateCustomerData } from './lib/invalidation'
import { useSubscriptions } from './useSubscriptions'

/**
 * Result type for the useSubscription hook.
 */
export interface UseSubscriptionResult {
  /** The current subscription, or null if none. Undefined until loaded. */
  subscription: SubscriptionDetails | null | undefined
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
  /** Cancel the current subscription */
  cancel: (
    params: Omit<CancelSubscriptionParams, 'id'>
  ) => Promise<unknown>
  /** Uncancel a scheduled cancellation for the current subscription */
  uncancel: (
    params?: Omit<UncancelSubscriptionParams, 'id'>
  ) => Promise<unknown>
  /** Adjust the current subscription to a different price/plan */
  adjust: (
    params: Omit<AdjustSubscriptionParams, 'subscriptionId'>
  ) => Promise<unknown>
}

/**
 * Hook to manage the current subscription with cancel/uncancel/adjust actions.
 *
 * This is a convenience wrapper around `useSubscriptions` that provides:
 * - The current subscription (first active subscription)
 * - Mutation actions for cancel, uncancel, and adjust operations
 *
 * For listing multiple subscriptions, use `useSubscriptions` instead.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @returns Object containing current subscription, loading state, error, and mutation actions
 *
 * @example
 * ```tsx
 * function SubscriptionManager() {
 *   const { subscription, isLoading, error, cancel, uncancel, adjust } = useSubscription()
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *   if (!subscription) return <NoSubscription />
 *
 *   return (
 *     <div>
 *       <p>Status: {subscription.status}</p>
 *       <button onClick={() => cancel({ cancellation: { timing: 'at_end_of_current_billing_period' } })}>
 *         Cancel
 *       </button>
 *       <button onClick={() => adjust({ priceSlug: 'pro-monthly' })}>
 *         Upgrade
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */
export const useSubscription = (): UseSubscriptionResult => {
  const { currentSubscription, isLoading, error } = useSubscriptions()
  const {
    baseURL,
    betterAuthBasePath,
    requestConfig,
    __devMode,
    billingMocks,
  } = useFlowgladConfig()
  const queryClient = useQueryClient()

  const cancel = async (
    params: Omit<CancelSubscriptionParams, 'id'>
  ): Promise<unknown> => {
    // Dev mode: return mock response
    if (__devMode) {
      if (!billingMocks) {
        throw new Error(
          'FlowgladProvider: __devMode requires billingMocks'
        )
      }
      return { success: true }
    }

    if (!currentSubscription) {
      throw new Error('No active subscription')
    }

    const flowgladRoute = getFlowgladRoute(
      baseURL,
      betterAuthBasePath
    )
    const response = await fetch(
      `${flowgladRoute}/${FlowgladActionKey.CancelSubscription}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...requestConfig?.headers,
        },
        body: JSON.stringify({
          id: currentSubscription.id,
          ...params,
        }),
      }
    )

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}`
      )
    }

    const data = await response.json()
    await invalidateCustomerData(queryClient)
    return data
  }

  const uncancel = async (
    params?: Omit<UncancelSubscriptionParams, 'id'>
  ): Promise<unknown> => {
    // Dev mode: return mock response
    if (__devMode) {
      if (!billingMocks) {
        throw new Error(
          'FlowgladProvider: __devMode requires billingMocks'
        )
      }
      return { success: true }
    }

    if (!currentSubscription) {
      throw new Error('No active subscription')
    }

    const flowgladRoute = getFlowgladRoute(
      baseURL,
      betterAuthBasePath
    )
    const response = await fetch(
      `${flowgladRoute}/${FlowgladActionKey.UncancelSubscription}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...requestConfig?.headers,
        },
        body: JSON.stringify({
          id: currentSubscription.id,
          ...params,
        }),
      }
    )

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}`
      )
    }

    const data = await response.json()
    await invalidateCustomerData(queryClient)
    return data
  }

  const adjust = async (
    params: Omit<AdjustSubscriptionParams, 'subscriptionId'>
  ): Promise<unknown> => {
    // Dev mode: return mock response
    if (__devMode) {
      if (!billingMocks) {
        throw new Error(
          'FlowgladProvider: __devMode requires billingMocks'
        )
      }
      return { success: true }
    }

    if (!currentSubscription) {
      throw new Error('No active subscription')
    }

    const flowgladRoute = getFlowgladRoute(
      baseURL,
      betterAuthBasePath
    )
    const response = await fetch(
      `${flowgladRoute}/${FlowgladActionKey.AdjustSubscription}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...requestConfig?.headers,
        },
        body: JSON.stringify({
          subscriptionId: currentSubscription.id,
          ...params,
        }),
      }
    )

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}`
      )
    }

    const data = await response.json()
    await invalidateCustomerData(queryClient)
    return data
  }

  return {
    subscription: currentSubscription,
    isLoading,
    error,
    cancel,
    uncancel,
    adjust,
  }
}
