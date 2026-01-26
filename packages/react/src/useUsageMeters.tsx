'use client'
import {
  type CustomerBillingDetails,
  FlowgladActionKey,
  flowgladActionValidators,
  type GetUsageMeterBalancesParams,
  type GetUsageMeterBalancesResponse,
  type UsageMeterBalance,
} from '@flowglad/shared'
import { useQuery } from '@tanstack/react-query'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { getFlowgladRoute } from './FlowgladContext'

/** Query key for usage meters (list) caching */
export const USAGE_METERS_QUERY_KEY = 'flowglad-usage-meters'

/** Query key for individual usage meter caching */
export const USAGE_METER_QUERY_KEY = 'flowglad-usage-meter'

type UsageMeterBalancesRouteResponse =
  | {
      data?: GetUsageMeterBalancesResponse | null
      error?: { code: string; json: Record<string, unknown> } | null
    }
  | undefined

/**
 * Result type for the useUsageMeters hook.
 */
export interface UseUsageMetersResult {
  /** All usage meter balances. Undefined until loaded. */
  usageMeters: UsageMeterBalance[] | undefined
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
}

/**
 * Result type for the useUsageMeter hook.
 */
export interface UseUsageMeterResult {
  /** Usage meter balance for the specific slug, or null if not found. */
  usageMeter: UsageMeterBalance | null
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
}

/**
 * Derives usage meter balances from billingMocks data.
 * Extracts usageMeterBalances from currentSubscriptions[].experimental.
 */
const deriveUsageMeterBalancesFromBillingMocks = (
  billingMocks: CustomerBillingDetails
): UsageMeterBalance[] => {
  const currentSubscriptions = billingMocks.currentSubscriptions ?? []
  const balances: UsageMeterBalance[] = []

  for (const subscription of currentSubscriptions) {
    const experimental = subscription.experimental
    if (experimental?.usageMeterBalances) {
      balances.push(...experimental.usageMeterBalances)
    }
  }

  return balances
}

/**
 * Hook to access usage meter balances for the current customer's subscriptions.
 *
 * Fetches usage meter balance data on mount. Can optionally filter by subscription ID.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @param params - Optional parameters
 * @param params.subscriptionId - Filter balances to a specific subscription
 *
 * @returns Object containing usage meter balances array, loading state, and error
 *
 * @example
 * ```tsx
 * function UsageDisplay() {
 *   const { usageMeters, isLoading, error } = useUsageMeters()
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *
 *   return (
 *     <div>
 *       {usageMeters?.map(meter => (
 *         <div key={meter.id}>
 *           {meter.name}: {meter.availableBalance}
 *         </div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export const useUsageMeters = (
  params?: GetUsageMeterBalancesParams
): UseUsageMetersResult => {
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
  } = useQuery<UsageMeterBalancesRouteResponse, Error>({
    queryKey: [USAGE_METERS_QUERY_KEY, params?.subscriptionId],
    enabled: !__devMode,
    queryFn: async () => {
      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.GetUsageMeterBalances}`,
        {
          method:
            flowgladActionValidators[
              FlowgladActionKey.GetUsageMeterBalances
            ].method,
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify(params ?? {}),
        }
      )

      const json = await response.json()
      return json as UsageMeterBalancesRouteResponse
    },
  })

  // Dev mode: derive balances from billingMocks
  if (__devMode) {
    if (!billingMocks) {
      throw new Error(
        'FlowgladProvider: __devMode requires billingMocks'
      )
    }
    const balances =
      deriveUsageMeterBalancesFromBillingMocks(billingMocks)

    // Apply subscriptionId filter if provided
    const filteredBalances = params?.subscriptionId
      ? balances.filter(
          (b) => b.subscriptionId === params.subscriptionId
        )
      : balances

    return {
      usageMeters: filteredBalances,
      isLoading: false,
      error: null,
    }
  }

  // Handle error responses from the API
  if (responseData?.error) {
    return {
      usageMeters: undefined,
      isLoading: false,
      error: new Error(
        responseData.error.json?.message?.toString() ??
          responseData.error.code ??
          'Failed to fetch usage meter balances'
      ),
    }
  }

  return {
    usageMeters: responseData?.data?.usageMeterBalances,
    isLoading,
    error: error ?? null,
  }
}

/**
 * Hook to access a specific usage meter balance by slug.
 *
 * This is a convenience wrapper around the usage meter endpoint that:
 * - Fetches all usage meter balances
 * - Filters to the specific meter by slug
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @param usageMeterSlug - The slug of the usage meter to access
 * @param params - Optional parameters
 * @param params.subscriptionId - Filter to a specific subscription
 *
 * @returns Object containing the usage meter balance, loading state, and error
 *
 * @example
 * ```tsx
 * function CreditBalance() {
 *   const { usageMeter, isLoading, error } = useUsageMeter('api-credits')
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *   if (!usageMeter) return <p>No credits found</p>
 *
 *   return <p>Available credits: {usageMeter.availableBalance}</p>
 * }
 * ```
 */
export const useUsageMeter = (
  usageMeterSlug: string,
  params?: GetUsageMeterBalancesParams
): UseUsageMeterResult => {
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
  } = useQuery<UsageMeterBalancesRouteResponse, Error>({
    queryKey: [
      USAGE_METER_QUERY_KEY,
      usageMeterSlug,
      params?.subscriptionId,
    ],
    enabled: !__devMode,
    queryFn: async () => {
      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.GetUsageMeterBalances}`,
        {
          method:
            flowgladActionValidators[
              FlowgladActionKey.GetUsageMeterBalances
            ].method,
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify(params ?? {}),
        }
      )

      const json = await response.json()
      return json as UsageMeterBalancesRouteResponse
    },
  })

  // Dev mode: derive balances from billingMocks
  if (__devMode) {
    if (!billingMocks) {
      throw new Error(
        'FlowgladProvider: __devMode requires billingMocks'
      )
    }
    const balances =
      deriveUsageMeterBalancesFromBillingMocks(billingMocks)

    // Apply subscriptionId filter if provided, then find by slug
    const filteredBalances = params?.subscriptionId
      ? balances.filter(
          (b) => b.subscriptionId === params.subscriptionId
        )
      : balances

    const usageMeter =
      filteredBalances.find((b) => b.slug === usageMeterSlug) ?? null

    return {
      usageMeter,
      isLoading: false,
      error: null,
    }
  }

  // Handle error responses from the API
  if (responseData?.error) {
    return {
      usageMeter: null,
      isLoading: false,
      error: new Error(
        responseData.error.json?.message?.toString() ??
          responseData.error.code ??
          'Failed to fetch usage meter balance'
      ),
    }
  }

  // Find the specific usage meter by slug
  const usageMeter =
    responseData?.data?.usageMeterBalances?.find(
      (b) => b.slug === usageMeterSlug
    ) ?? null

  return {
    usageMeter,
    isLoading,
    error: error ?? null,
  }
}
