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
 * Derives purchases data from billingMocks.
 */
const derivePurchasesFromBillingMocks = (
  billingMocks: CustomerBillingDetails
): {
  purchases: PurchaseDetails[]
} => {
  return {
    purchases: (billingMocks.purchases ?? []) as PurchaseDetails[],
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

  // Dev mode: derive purchases from billingMocks
  if (__devMode) {
    if (!billingMocks) {
      throw new Error(
        'FlowgladProvider: __devMode requires billingMocks'
      )
    }
    const { purchases } =
      derivePurchasesFromBillingMocks(billingMocks)

    return {
      purchases,
      hasPurchased: (purchaseName: string) =>
        purchases.some((p) => p.name === purchaseName),
      isLoading: false,
      error: null,
    }
  }

  // Handle error responses from the API
  if (responseData?.error) {
    return {
      purchases: undefined,
      hasPurchased: () => false,
      isLoading: false,
      error: new Error(
        responseData.error.json?.message?.toString() ??
          responseData.error.code ??
          'Failed to fetch purchases'
      ),
    }
  }

  const purchases = responseData?.data?.purchases

  return {
    purchases,
    hasPurchased: (purchaseName: string) => {
      if (!purchases) return false
      return purchases.some((p) => p.name === purchaseName)
    },
    isLoading,
    error: error ?? null,
  }
}
