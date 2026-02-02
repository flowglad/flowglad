'use client'
import {
  type CustomerBillingDetails,
  FlowgladActionKey,
  flowgladActionValidators,
  type GetSubscriptionsParams,
  type GetSubscriptionsResponse,
  type SubscriptionDetails,
} from '@flowglad/shared'
import { useQuery } from '@tanstack/react-query'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { getFlowgladRoute } from './FlowgladContext'

/** Query key for subscriptions caching */
export const SUBSCRIPTIONS_QUERY_KEY = 'flowglad-subscriptions'

type SubscriptionsRouteResponse =
  | {
      data?: GetSubscriptionsResponse | null
      error?: { code: string; json: Record<string, unknown> } | null
    }
  | undefined

/**
 * Result type for the useSubscriptions hook.
 */
export interface UseSubscriptionsResult {
  /** All subscriptions. Undefined until loaded. */
  subscriptions: SubscriptionDetails[] | undefined
  /** Current (active) subscriptions. Undefined until loaded. */
  currentSubscriptions: SubscriptionDetails[] | undefined
  /** The first current subscription, or null if none. Undefined until loaded. */
  currentSubscription: SubscriptionDetails | null | undefined
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
}

/**
 * Derives subscription data from billingMocks data.
 */
const deriveSubscriptionsFromBillingMocks = (
  billingMocks: CustomerBillingDetails,
  params?: GetSubscriptionsParams
): GetSubscriptionsResponse => {
  const currentSubscriptions = billingMocks.currentSubscriptions ?? []
  const allSubscriptions = billingMocks.subscriptions ?? []

  // If includeHistorical is false or not specified, only return current subscriptions
  const subscriptions = params?.includeHistorical
    ? allSubscriptions
    : currentSubscriptions

  return {
    subscriptions,
    currentSubscriptions,
    currentSubscription: billingMocks.currentSubscription ?? null,
  }
}

/**
 * Hook to access subscription data for the current customer.
 *
 * Fetches subscription data on mount. Returns both all subscriptions
 * and current (active) subscriptions.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @param params - Optional parameters
 * @param params.includeHistorical - Include non-current (historical) subscriptions
 *
 * @returns Object containing subscriptions arrays, loading state, and error
 *
 * @example
 * ```tsx
 * function SubscriptionsList() {
 *   const { subscriptions, currentSubscription, isLoading, error } = useSubscriptions()
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *
 *   return (
 *     <div>
 *       <h2>Current: {currentSubscription?.id}</h2>
 *       {subscriptions?.map(sub => (
 *         <div key={sub.id}>{sub.status}</div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export const useSubscriptions = (
  params?: GetSubscriptionsParams
): UseSubscriptionsResult => {
  const {
    baseURL,
    betterAuthBasePath,
    requestConfig,
    __devMode,
    billingMocks,
  } = useFlowgladConfig()

  const {
    data: responseData,
    isLoading,
    error,
  } = useQuery<SubscriptionsRouteResponse, Error>({
    queryKey: [SUBSCRIPTIONS_QUERY_KEY, params],
    enabled: !__devMode,
    queryFn: async () => {
      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.GetSubscriptions}`,
        {
          method:
            flowgladActionValidators[
              FlowgladActionKey.GetSubscriptions
            ].method,
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify(params ?? {}),
        }
      )

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}`
        )
      }

      const json = await response.json()
      return json as SubscriptionsRouteResponse
    },
  })

  // Dev mode: derive subscriptions from billingMocks
  if (__devMode) {
    if (!billingMocks) {
      throw new Error(
        'FlowgladProvider: __devMode requires billingMocks'
      )
    }
    const data = deriveSubscriptionsFromBillingMocks(
      billingMocks,
      params
    )

    return {
      subscriptions: data.subscriptions,
      currentSubscriptions: data.currentSubscriptions,
      currentSubscription: data.currentSubscription,
      isLoading: false,
      error: null,
    }
  }

  // Handle error responses from the API
  if (responseData?.error) {
    return {
      subscriptions: undefined,
      currentSubscriptions: undefined,
      currentSubscription: undefined,
      isLoading: false,
      error: new Error(
        responseData.error.json?.message?.toString() ??
          responseData.error.code ??
          'Failed to fetch subscriptions'
      ),
    }
  }

  return {
    subscriptions: responseData?.data?.subscriptions,
    currentSubscriptions: responseData?.data?.currentSubscriptions,
    currentSubscription: responseData?.data?.currentSubscription,
    isLoading,
    error: error ?? null,
  }
}
