'use client'
import {
  type CustomerBillingDetails,
  FlowgladActionKey,
  flowgladActionValidators,
  type GetInvoicesParams,
  type GetInvoicesResponse,
  type InvoiceDetails,
} from '@flowglad/shared'
import { useQuery } from '@tanstack/react-query'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { getFlowgladRoute } from './FlowgladContext'

/** Query key for invoices caching */
export const INVOICES_QUERY_KEY = 'flowglad-invoices'

type InvoicesRouteResponse =
  | {
      data?: GetInvoicesResponse | null
      error?: { code: string; json: Record<string, unknown> } | null
    }
  | undefined

/**
 * Runtime type guard for InvoicesRouteResponse.
 * Validates that the parsed JSON response matches the expected shape.
 */
export const isInvoicesRouteResponse = (
  value: unknown
): value is InvoicesRouteResponse => {
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
      'invoices' in data &&
      data.invoices !== null &&
      data.invoices !== undefined &&
      !Array.isArray(data.invoices)
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
 * Result type for the useInvoices hook.
 */
export interface UseInvoicesResult {
  /** Invoices for the customer. Undefined until loaded. */
  invoices: InvoiceDetails[] | undefined
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
}

/**
 * Runtime type guard that checks whether a single item
 * has the required InvoiceDetails shape (invoice object with
 * string id, and an invoiceLineItems array).
 */
const isInvoiceDetails = (
  value: unknown
): value is InvoiceDetails => {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  if (
    !('invoice' in obj) ||
    obj.invoice === null ||
    typeof obj.invoice !== 'object'
  ) {
    return false
  }
  const invoice = obj.invoice as Record<string, unknown>
  if (typeof invoice.id !== 'string') {
    return false
  }
  if (
    !('invoiceLineItems' in obj) ||
    !Array.isArray(obj.invoiceLineItems)
  ) {
    return false
  }
  return true
}

/**
 * Runtime type guard for an array of InvoiceDetails.
 */
export const isInvoiceDetailsArray = (
  value: unknown
): value is InvoiceDetails[] => {
  if (!Array.isArray(value)) {
    return false
  }
  return value.every(isInvoiceDetails)
}

/**
 * Derives invoices data from billingMocks.
 */
const deriveInvoicesFromBillingMocks = (
  billingMocks: CustomerBillingDetails
): {
  invoices: InvoiceDetails[]
} => {
  const raw = billingMocks.invoices ?? []
  return {
    invoices: isInvoiceDetailsArray(raw) ? raw : [],
  }
}

/**
 * Hook to access invoices for the current customer.
 *
 * Fetches invoices on mount with optional pagination.
 * This hook is read-only for displaying billing history.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @param params - Optional parameters including limit and startingAfter for pagination
 * @returns Object containing invoices array, loading state, and error
 *
 * @example
 * ```tsx
 * function InvoiceHistory() {
 *   const { invoices, isLoading, error } = useInvoices()
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *
 *   return (
 *     <ul>
 *       {invoices?.map(inv => (
 *         <li key={inv.invoice.id}>
 *           {inv.invoice.status} - {inv.invoice.amountDue}
 *         </li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 */
export const useInvoices = (
  params?: GetInvoicesParams
): UseInvoicesResult => {
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
  } = useQuery<InvoicesRouteResponse, Error>({
    queryKey: [INVOICES_QUERY_KEY, params],
    enabled: !__devMode,
    queryFn: async () => {
      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.GetInvoices}`,
        {
          method:
            flowgladActionValidators[FlowgladActionKey.GetInvoices]
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
      if (!isInvoicesRouteResponse(json)) {
        //to avoid logging the entire json object
        const summary =
          json !== null && typeof json === 'object'
            ? `type=object, keys=[${Object.keys(json).join(', ')}]`
            : `type=${typeof json}`
        throw new Error(
          `Invalid invoices response format: ${summary}`
        )
      }
      return json
    },
  })

  // Dev mode: derive invoices from billingMocks
  if (__devMode) {
    if (!billingMocks) {
      throw new Error(
        'FlowgladProvider: __devMode requires billingMocks'
      )
    }
    const { invoices } = deriveInvoicesFromBillingMocks(billingMocks)

    return {
      invoices,
      isLoading: false,
      error: null,
    }
  }

  // Handle error responses from the API
  if (responseData?.error) {
    return {
      invoices: undefined,
      isLoading: false,
      error: new Error(
        responseData.error.json?.message?.toString() ??
          responseData.error.code ??
          'Failed to fetch invoices'
      ),
    }
  }

  return {
    invoices: responseData?.data?.invoices,
    isLoading,
    error: error ?? null,
  }
}
