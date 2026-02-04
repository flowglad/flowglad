'use client'
import {
  type CustomerDetails,
  FlowgladActionKey,
  flowgladActionValidators,
  type GetCustomerDetailsResponse,
} from '@flowglad/shared'
import { useQuery } from '@tanstack/react-query'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { getFlowgladRoute } from './FlowgladContext'

/** Query key for customer details caching */
export const CUSTOMER_DETAILS_QUERY_KEY = 'flowglad-customer-details'

type CustomerDetailsRouteResponse =
  | {
      data?: GetCustomerDetailsResponse | null
      error?: { code: string; json: Record<string, unknown> } | null
    }
  | undefined

/**
 * Result type for the useCustomerDetails hook.
 */
export interface UseCustomerDetailsResult {
  /** Customer details. Undefined until loaded. */
  customer: CustomerDetails | undefined
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
}

/**
 * Hook to access customer profile information for the current authenticated customer.
 *
 * Fetches customer identity data (id, email, name, externalId, timestamps) on mount.
 * This hook is read-only - use `useBilling` for full billing context including mutations.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @returns Object containing customer details, loading state, and error
 *
 * @example
 * ```tsx
 * function CustomerProfile() {
 *   const { customer, isLoading, error } = useCustomerDetails()
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *
 *   return (
 *     <div>
 *       <h1>Welcome, {customer?.name ?? customer?.email}</h1>
 *       <p>Customer ID: {customer?.id}</p>
 *     </div>
 *   )
 * }
 * ```
 */
export const useCustomerDetails = (): UseCustomerDetailsResult => {
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
  } = useQuery<CustomerDetailsRouteResponse, Error>({
    queryKey: [CUSTOMER_DETAILS_QUERY_KEY],
    enabled: !__devMode,
    queryFn: async () => {
      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.GetCustomerDetails}`,
        {
          method:
            flowgladActionValidators[
              FlowgladActionKey.GetCustomerDetails
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
      return json as CustomerDetailsRouteResponse
    },
  })

  // Dev mode: derive customer from billingMocks
  if (__devMode) {
    if (!billingMocks?.customer) {
      throw new Error('billingMocks.customer is required in dev mode')
    }
    const customer: CustomerDetails = {
      id: billingMocks.customer.id,
      livemode: billingMocks.customer.livemode,
      email: billingMocks.customer.email,
      name: billingMocks.customer.name,
      externalId: billingMocks.customer.externalId,
      createdAt:
        typeof billingMocks.customer.createdAt === 'string'
          ? billingMocks.customer.createdAt
          : new Date(billingMocks.customer.createdAt).toISOString(),
      updatedAt:
        typeof billingMocks.customer.updatedAt === 'string'
          ? billingMocks.customer.updatedAt
          : new Date(billingMocks.customer.updatedAt).toISOString(),
    }

    return {
      customer,
      isLoading: false,
      error: null,
    }
  }

  // Handle error responses from the API
  if (responseData?.error) {
    return {
      customer: undefined,
      isLoading: false,
      error: new Error(
        responseData.error.json?.message?.toString() ??
          responseData.error.code ??
          'Failed to fetch customer details'
      ),
    }
  }

  return {
    customer: responseData?.data?.customer,
    isLoading,
    error: error ?? null,
  }
}
