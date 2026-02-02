'use client'
import {
  type CustomerBillingDetails,
  FlowgladActionKey,
  flowgladActionValidators,
  type GetPaymentMethodsResponse,
  type PaymentMethodDetails,
} from '@flowglad/shared'
import { useQuery } from '@tanstack/react-query'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { getFlowgladRoute } from './FlowgladContext'

/** Query key for payment methods caching */
export const PAYMENT_METHODS_QUERY_KEY = 'flowglad-payment-methods'

type PaymentMethodsRouteResponse =
  | {
      data?: GetPaymentMethodsResponse | null
      error?: { code: string; json: Record<string, unknown> } | null
    }
  | undefined

/**
 * Result type for the usePaymentMethods hook.
 */
export interface UsePaymentMethodsResult {
  /** Payment methods for the customer. Undefined until loaded. */
  paymentMethods: PaymentMethodDetails[] | undefined
  /** URL to the billing portal for managing payment methods. */
  billingPortalUrl: string | null | undefined
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
}

/**
 * Derives payment methods data from billingMocks.
 */
const derivePaymentMethodsFromBillingMocks = (
  billingMocks: CustomerBillingDetails
): {
  paymentMethods: PaymentMethodDetails[]
  billingPortalUrl: string | null
} => {
  return {
    paymentMethods: billingMocks.paymentMethods ?? [],
    billingPortalUrl: billingMocks.billingPortalUrl ?? null,
  }
}

/**
 * Hook to access payment methods for the current customer.
 *
 * Fetches payment methods and billing portal URL on mount.
 * This hook is read-only - adding payment methods goes through `useCheckouts`.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @returns Object containing paymentMethods array, billingPortalUrl, loading state, and error
 *
 * @example
 * ```tsx
 * function PaymentMethodsDisplay() {
 *   const { paymentMethods, billingPortalUrl, isLoading, error } = usePaymentMethods()
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *
 *   return (
 *     <div>
 *       {paymentMethods?.map(pm => (
 *         <div key={pm.id}>
 *           {pm.card?.brand} **** {pm.card?.last4}
 *         </div>
 *       ))}
 *       {billingPortalUrl && (
 *         <a href={billingPortalUrl}>Manage Billing</a>
 *       )}
 *     </div>
 *   )
 * }
 * ```
 */
export const usePaymentMethods = (): UsePaymentMethodsResult => {
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
  } = useQuery<PaymentMethodsRouteResponse, Error>({
    queryKey: [PAYMENT_METHODS_QUERY_KEY],
    enabled: !__devMode,
    queryFn: async () => {
      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.GetPaymentMethods}`,
        {
          method:
            flowgladActionValidators[
              FlowgladActionKey.GetPaymentMethods
            ].method,
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify({}),
        }
      )

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}`
        )
      }

      const json = await response.json()
      return json as PaymentMethodsRouteResponse
    },
  })

  // Dev mode: derive payment methods from billingMocks
  if (__devMode) {
    if (!billingMocks) {
      throw new Error(
        'FlowgladProvider: __devMode requires billingMocks'
      )
    }
    const { paymentMethods, billingPortalUrl } =
      derivePaymentMethodsFromBillingMocks(billingMocks)

    return {
      paymentMethods,
      billingPortalUrl,
      isLoading: false,
      error: null,
    }
  }

  // Handle error responses from the API
  if (responseData?.error) {
    return {
      paymentMethods: undefined,
      billingPortalUrl: undefined,
      isLoading: false,
      error: new Error(
        responseData.error.json?.message?.toString() ??
          responseData.error.code ??
          'Failed to fetch payment methods'
      ),
    }
  }

  return {
    paymentMethods: responseData?.data?.paymentMethods,
    billingPortalUrl: responseData?.data?.billingPortalUrl,
    isLoading,
    error: error ?? null,
  }
}
