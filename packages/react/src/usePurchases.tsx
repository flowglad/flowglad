'use client'
import {
  type CustomerBillingDetails,
  FlowgladActionKey,
  flowgladActionValidators,
  type GetPurchasesParams,
  type GetPurchasesResponse,
  type PurchaseDetails,
} from '@flowglad/shared'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { getFlowgladRoute } from './FlowgladContext'

/** Query key for purchases caching */
export const PURCHASES_QUERY_KEY = 'flowglad-purchases'

type PurchasesRouteResponse =
  | {
      data?: GetPurchasesResponse | null
      error?: { code: string; json: Record<string, unknown> } | null
    }
  | undefined

/**
 * Runtime type guard for PurchasesRouteResponse.
 * Validates that the parsed JSON response matches the expected shape.
 */
export const isPurchasesRouteResponse = (
  value: unknown
): value is PurchasesRouteResponse => {
  if (value === undefined) {
    return true
  }

  if (value === null) {
    return false
  }

  if (typeof value !== 'object') {
    return false
  }

  const obj = value as Record<string, unknown>

  if ('data' in obj && obj.data !== null && obj.data !== undefined) {
    if (typeof obj.data !== 'object') {
      return false
    }
    const data = obj.data as Record<string, unknown>
    if (
      'purchases' in data &&
      data.purchases !== null &&
      data.purchases !== undefined &&
      !Array.isArray(data.purchases)
    ) {
      return false
    }
  }

  if (
    'error' in obj &&
    obj.error !== null &&
    obj.error !== undefined
  ) {
    if (typeof obj.error !== 'object') {
      return false
    }
    const error = obj.error as Record<string, unknown>
    if ('code' in error && typeof error.code !== 'string') {
      return false
    }
    if (
      'json' in error &&
      error.json !== null &&
      typeof error.json !== 'object'
    ) {
      return false
    }
  }

  return true
}

/**
 * Result type for the usePurchases hook.
 */
export interface UsePurchasesResult {
  /** Purchases for the customer. Undefined until loaded. */
  purchases: PurchaseDetails[] | undefined
  /** Check if a product has been purchased by name */
  hasPurchased: (purchaseName: string) => boolean
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
}

/**
 * Runtime type guard that checks whether a single item
 * has the required PurchaseDetails shape (string id, name,
 * priceId, and status).
 */
const isPurchaseDetails = (
  value: unknown
): value is PurchaseDetails => {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.priceId === 'string' &&
    typeof obj.status === 'string'
  )
}

/**
 * Runtime type guard for an array of PurchaseDetails.
 */
export const isPurchaseDetailsArray = (
  value: unknown
): value is PurchaseDetails[] => {
  if (!Array.isArray(value)) {
    return false
  }
  return value.every(isPurchaseDetails)
}

/**
 * Derives purchases data from billingMocks.
 */
const derivePurchasesFromBillingMocks = (
  billingMocks: CustomerBillingDetails
): {
  purchases: PurchaseDetails[]
} => {
  const raw = billingMocks.purchases ?? []
  return {
    purchases: isPurchaseDetailsArray(raw) ? raw : [],
  }
}

/**
 * Hook to access purchases for the current customer.
 *
 * Fetches purchases on mount with optional pagination.
 * This hook is read-only for displaying purchase history.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @param params - Optional parameters including limit and startingAfter for pagination
 * @returns Object containing purchases array, hasPurchased helper, loading state, and error
 *
 * @example
 * ```tsx
 * function PurchaseHistory() {
 *   const { purchases, hasPurchased, isLoading, error } = usePurchases()
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *
 *   return (
 *     <ul>
 *       {purchases?.map(p => (
 *         <li key={p.id}>
 *           {p.name} - {p.status}
 *         </li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 */
export const usePurchases = (
  params?: GetPurchasesParams
): UsePurchasesResult => {
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
  } = useQuery<PurchasesRouteResponse, Error>({
    queryKey: [PURCHASES_QUERY_KEY, params],
    enabled: !__devMode,
    queryFn: async () => {
      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.GetPurchases}`,
        {
          method:
            flowgladActionValidators[FlowgladActionKey.GetPurchases]
              .method,
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

      const json: unknown = await response.json()
      if (!isPurchasesRouteResponse(json)) {
        //to avoid logging the entire json object
        const summary =
          json !== null && typeof json === 'object'
            ? `type=object, keys=[${Object.keys(json).join(', ')}]`
            : `type=${typeof json}`
        throw new Error(
          `Invalid purchases response format: ${summary}`
        )
      }
      return json
    },
  })

  // All hooks called unconditionally before any conditional returns.

  // Memoize dev-mode purchases so the reference is stable across renders
  const devPurchases = useMemo(() => {
    if (!__devMode || !billingMocks) return undefined
    return derivePurchasesFromBillingMocks(billingMocks).purchases
  }, [__devMode, billingMocks])

  // Resolved purchases: dev-mode derivation or API response
  const purchases = __devMode
    ? devPurchases
    : responseData?.data?.purchases

  // Stable hasPurchased callback keyed on the purchases reference
  const hasPurchased = useCallback(
    (purchaseName: string) => {
      if (!purchases) return false
      return purchases.some((p) => p.name === purchaseName)
    },
    [purchases]
  )

  // Memoize the API-level error so the same Error instance is
  // returned across renders when responseData.error is unchanged.
  const apiError = useMemo(() => {
    if (!responseData?.error) return null
    return new Error(
      (typeof responseData.error.json?.message === 'string'
        ? responseData.error.json.message
        : undefined) ??
        responseData.error.code ??
        'Failed to fetch purchases'
    )
  }, [responseData?.error])

  // Dev mode: derive purchases from billingMocks
  if (__devMode) {
    if (!billingMocks) {
      throw new Error(
        'FlowgladProvider: __devMode requires billingMocks'
      )
    }
    return {
      purchases,
      hasPurchased,
      isLoading: false,
      error: null,
    }
  }

  // Handle error responses from the API
  if (apiError) {
    return {
      purchases: undefined,
      hasPurchased,
      isLoading: false,
      error: apiError,
    }
  }

  return {
    purchases,
    hasPurchased,
    isLoading,
    error: error ?? null,
  }
}
