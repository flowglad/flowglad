'use client'
import type { Flowglad } from '@flowglad/node'
import {
  type AdjustSubscriptionParams,
  type BillingWithChecks,
  type CancelSubscriptionParams,
  type ClientCreateUsageEventParams,
  type CreateActivateSubscriptionCheckoutSessionParams,
  type CreateAddPaymentMethodCheckoutSessionParams,
  type CreateProductCheckoutSessionParams,
  type CustomerBillingDetails,
  constructCheckFeatureAccess,
  constructCheckUsageBalance,
  constructGetPrice,
  constructGetProduct,
  constructHasPurchased,
  FlowgladActionKey,
  flowgladActionValidators,
  type GetPricingModelResponse,
  type PricingModel,
  type UncancelSubscriptionParams,
} from '@flowglad/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { devError } from './lib/utils'
import { validateUrl } from './utils'

/**
 * Constructs the base route for Flowglad API calls.
 *
 * @param baseURL - Optional base URL for the Flowglad API route handler
 * @param betterAuthBasePath - Optional Better Auth base path for routing through Better Auth endpoints
 * @returns The base route for Flowglad API calls
 *
 * When `betterAuthBasePath` is provided, routes are directed to Better Auth endpoints:
 * - e.g., `/api/auth/flowglad/customers/billing`
 *
 * When only `baseURL` is provided (or neither), routes use the standalone handler:
 * - e.g., `/api/flowglad/customers/billing`
 */
// Export for testing
export const getFlowgladRoute = (
  baseURL?: string,
  betterAuthBasePath?: string
): string => {
  if (betterAuthBasePath) {
    // Remove trailing slash to prevent malformed URLs like /api/auth//flowglad
    const sanitizedPath = betterAuthBasePath
      .trim()
      .replace(/\/+$/, '')
    // Better Auth routes are under {basePath}/flowglad
    return `${sanitizedPath}/flowglad`
  }
  const sanitizedBaseURL = baseURL?.trim() ?? ''
  if (sanitizedBaseURL !== '') {
    // Remove trailing slashes to prevent malformed URLs like https://x.com//api/flowglad
    return `${sanitizedBaseURL.replace(/\/+$/, '')}/api/flowglad`
  }
  return '/api/flowglad'
}

export type FrontendProductCreateCheckoutSessionParams =
  CreateProductCheckoutSessionParams & {
    autoRedirect?: boolean
  }

export type FrontendCreateAddPaymentMethodCheckoutSessionParams =
  Omit<CreateAddPaymentMethodCheckoutSessionParams, 'type'> & {
    autoRedirect?: boolean
  }

export type FrontendCreateActivateSubscriptionCheckoutSessionParams =
  Omit<CreateActivateSubscriptionCheckoutSessionParams, 'type'> & {
    autoRedirect?: boolean
  }

type CreateCheckoutSessionResponse =
  | {
      id: string
      url: string
    }
  | { error: { code: string; json: Record<string, unknown> } }

export type LoadedFlowgladContextValues = BillingWithChecks & {
  loaded: true
  reload: () => Promise<void>
  cancelSubscription: (params: CancelSubscriptionParams) => Promise<{
    subscription: Flowglad.Subscriptions.SubscriptionCancelResponse
  }>
  uncancelSubscription: (
    params: UncancelSubscriptionParams
  ) => Promise<{
    subscription: Flowglad.Subscriptions.SubscriptionUncancelResponse
  }>
  /**
   * Adjust a subscription to a different price.
   *
   * @example
   * // Simplest: adjust by price slug (quantity defaults to 1)
   * await adjustSubscription({ priceSlug: 'pro-monthly' })
   *
   * // With quantity
   * await adjustSubscription({ priceSlug: 'pro-monthly', quantity: 5 })
   *
   * // Using price ID
   * await adjustSubscription({ priceId: 'price_abc123', quantity: 3 })
   *
   * // With timing override
   * await adjustSubscription({
   *   priceSlug: 'pro-monthly',
   *   timing: 'at_end_of_current_billing_period'
   * })
   *
   * // Explicit subscription ID (for multi-subscription customers)
   * await adjustSubscription({
   *   priceSlug: 'pro-monthly',
   *   subscriptionId: 'sub_123'
   * })
   *
   * // Complex adjustment with multiple items
   * await adjustSubscription({
   *   subscriptionItems: [
   *     { priceSlug: 'base-plan', quantity: 1 },
   *     { priceSlug: 'addon-storage', quantity: 3 },
   *   ],
   *   timing: 'immediately',
   *   prorate: true,
   * })
   *
   * @param params - Adjustment parameters (one of three forms)
   * @param params.priceSlug - Adjust to a price by slug
   * @param params.priceId - Adjust to a price by ID
   * @param params.subscriptionItems - Array of items for multi-item adjustments
   * @param params.quantity - Number of units (default: 1)
   * @param params.subscriptionId - Subscription ID (auto-resolves if customer has exactly 1 subscription)
   * @param params.timing - 'immediately' | 'at_end_of_current_billing_period' | 'auto' (default: 'auto')
   * @param params.prorate - Whether to prorate (default: true for immediate, false for end-of-period)
   */
  adjustSubscription: (params: AdjustSubscriptionParams) => Promise<{
    subscription: Flowglad.Subscriptions.SubscriptionAdjustResponse
  }>
  createCheckoutSession: (
    params: FrontendProductCreateCheckoutSessionParams
  ) => Promise<CreateCheckoutSessionResponse>
  createAddPaymentMethodCheckoutSession: (
    params: FrontendCreateAddPaymentMethodCheckoutSessionParams
  ) => Promise<CreateCheckoutSessionResponse>
  createActivateSubscriptionCheckoutSession: (
    params: FrontendCreateActivateSubscriptionCheckoutSessionParams
  ) => Promise<CreateCheckoutSessionResponse>
  createUsageEvent: (
    params: ClientCreateUsageEventParams
  ) => Promise<
    | { usageEvent: { id: string } }
    | { error: { code: string; json: Record<string, unknown> } }
  >
  errors: null
}

export interface NonPresentContextValues {
  customer: null
  subscriptions: null
  createCheckoutSession: null
  createAddPaymentMethodCheckoutSession: null
  createActivateSubscriptionCheckoutSession: null
  createUsageEvent: null
  checkFeatureAccess: null
  checkUsageBalance: null
  hasPurchased: null
  pricingModel: null
  billingPortalUrl: null
  reload: null
  /**
   * @deprecated Use `pricingModel` instead. This property is kept for backward compatibility.
   */
  catalog: null
  invoices: []
  paymentMethods: []
  purchases: []
  cancelSubscription: null
  uncancelSubscription: null
  adjustSubscription: null
  currentSubscriptions: []
  currentSubscription: null
}

export interface NotLoadedFlowgladContextValues
  extends NonPresentContextValues {
  loaded: false
  errors: null
}

export interface NotAuthenticatedFlowgladContextValues
  extends NonPresentContextValues {
  loaded: true
  errors: null
}

export interface ErrorFlowgladContextValues
  extends NonPresentContextValues {
  loaded: true
  errors: Error[]
}

export type FlowgladContextValues =
  | LoadedFlowgladContextValues
  | NotLoadedFlowgladContextValues
  | NotAuthenticatedFlowgladContextValues
  | ErrorFlowgladContextValues

const notPresentContextValues: NonPresentContextValues = {
  customer: null,
  subscriptions: null,
  createCheckoutSession: null,
  createAddPaymentMethodCheckoutSession: null,
  createActivateSubscriptionCheckoutSession: null,
  createUsageEvent: null,
  checkFeatureAccess: null,
  checkUsageBalance: null,
  hasPurchased: null,
  pricingModel: null,
  billingPortalUrl: null,
  reload: null,
  catalog: null,
  invoices: [],
  paymentMethods: [],
  purchases: [],
  cancelSubscription: null,
  uncancelSubscription: null,
  adjustSubscription: null,
  currentSubscriptions: [],
  currentSubscription: null,
}

type CheckoutSessionParamsBase = {
  successUrl: string
  cancelUrl: string
  autoRedirect?: boolean
} & Record<string, unknown>

// Builds a context-facing helper that hits a specific checkout session subroute,
// while reusing shared validation, axios plumbing, and optional payload shaping.
const constructCheckoutSessionCreator =
  <TParams extends CheckoutSessionParamsBase>(
    actionKey: FlowgladActionKey,
    baseURL: string | undefined,
    betterAuthBasePath: string | undefined,
    requestConfig?: RequestConfig,
    mapPayload?: (
      params: TParams,
      basePayload: Omit<TParams, 'autoRedirect'>
    ) => Record<string, unknown>
  ) =>
  async (params: TParams): Promise<CreateCheckoutSessionResponse> => {
    validateUrl(params.successUrl, 'successUrl')
    validateUrl(params.cancelUrl, 'cancelUrl')
    if (baseURL) {
      validateUrl(baseURL, 'baseURL', true)
    }

    const headers = requestConfig?.headers
    const { autoRedirect, ...basePayload } = params
    // The mapPayload hook lets each caller tweak the server payload without
    // duplicating the core request logic.
    const payload =
      mapPayload?.(params, basePayload) ??
      (basePayload as Record<string, unknown>)

    const flowgladRoute = getFlowgladRoute(
      baseURL,
      betterAuthBasePath
    )
    const response = await fetch(`${flowgladRoute}/${actionKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    })
    const json: {
      data: Flowglad.CheckoutSessions.CheckoutSessionCreateResponse
      error?: { code: string; json: Record<string, unknown> }
    } = await response.json()
    const data = json.data
    if (json.error) {
      console.error(
        'FlowgladContext: Checkout session creation failed',
        json
      )
      return { error: json.error }
    }
    if (autoRedirect) {
      window.location.href = data.url
    }
    return { id: data.checkoutSession.id, url: data.url }
  }

interface ConstructCancelSubscriptionParams {
  baseURL: string | undefined
  betterAuthBasePath: string | undefined
  requestConfig?: RequestConfig
  queryClient: ReturnType<typeof useQueryClient>
}

const constructCancelSubscription =
  (constructParams: ConstructCancelSubscriptionParams) =>
  async (
    params: CancelSubscriptionParams
  ): Promise<{
    subscription: Flowglad.Subscriptions.SubscriptionCancelResponse
  }> => {
    const {
      baseURL,
      betterAuthBasePath,
      requestConfig,
      queryClient,
    } = constructParams
    const headers = requestConfig?.headers
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
          ...headers,
        },
        body: JSON.stringify(params),
      }
    )
    const json: {
      data: Flowglad.Subscriptions.SubscriptionCancelResponse
      error?: { code: string; json: Record<string, unknown> }
    } = await response.json()
    const data = json.data
    if (json.error) {
      console.error(
        'FlowgladContext: Subscription cancellation failed',
        json
      )
    } else {
      // Refetch customer billing after successful cancellation
      await queryClient.invalidateQueries({
        queryKey: [FlowgladActionKey.GetCustomerBilling],
      })
    }
    return {
      subscription: data,
    }
  }

interface ConstructUncancelSubscriptionParams {
  baseURL: string | undefined
  betterAuthBasePath: string | undefined
  requestConfig?: RequestConfig
  queryClient: ReturnType<typeof useQueryClient>
}

const constructUncancelSubscription =
  (constructParams: ConstructUncancelSubscriptionParams) =>
  async (
    params: UncancelSubscriptionParams
  ): Promise<{
    subscription: Flowglad.Subscriptions.SubscriptionUncancelResponse
  }> => {
    const {
      baseURL,
      betterAuthBasePath,
      requestConfig,
      queryClient,
    } = constructParams
    const headers = requestConfig?.headers
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
          ...headers,
        },
        body: JSON.stringify(params),
      }
    )
    const json: {
      data: Flowglad.Subscriptions.SubscriptionUncancelResponse
      error?: { code: string; json: Record<string, unknown> }
    } = await response.json()
    const data = json.data
    if (json.error) {
      console.error(
        'FlowgladContext: Subscription uncancellation failed',
        json
      )
    } else {
      // Refetch customer billing after successful uncancellation
      await queryClient.invalidateQueries({
        queryKey: [FlowgladActionKey.GetCustomerBilling],
      })
    }
    return {
      subscription: data,
    }
  }

interface ConstructAdjustSubscriptionParams {
  baseURL: string | undefined
  betterAuthBasePath: string | undefined
  requestConfig?: RequestConfig
  queryClient: ReturnType<typeof useQueryClient>
  currentSubscriptions:
    | CustomerBillingDetails['currentSubscriptions']
    | null
}

const constructAdjustSubscription =
  (constructParams: ConstructAdjustSubscriptionParams) =>
  async (
    params: AdjustSubscriptionParams
  ): Promise<{
    subscription: Flowglad.Subscriptions.SubscriptionAdjustResponse
  }> => {
    const {
      baseURL,
      betterAuthBasePath,
      requestConfig,
      queryClient,
      currentSubscriptions,
    } = constructParams
    const headers = requestConfig?.headers
    const flowgladRoute = getFlowgladRoute(
      baseURL,
      betterAuthBasePath
    )

    // Auto-resolve subscriptionId if not provided
    let subscriptionId = params.subscriptionId
    if (!subscriptionId) {
      if (
        !currentSubscriptions ||
        currentSubscriptions.length === 0
      ) {
        throw new Error(
          'No active subscription found for this customer'
        )
      }
      if (currentSubscriptions.length > 1) {
        throw new Error(
          'Customer has multiple active subscriptions. Please specify subscriptionId in params.'
        )
      }
      subscriptionId = currentSubscriptions[0].id
    }

    const response = await fetch(
      `${flowgladRoute}/${FlowgladActionKey.AdjustSubscription}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          ...params,
          subscriptionId,
        }),
      }
    )

    if (!response.ok) {
      throw new Error(
        `Subscription adjustment failed: ${response.status} ${response.statusText}`
      )
    }

    const json: {
      data?: Flowglad.Subscriptions.SubscriptionAdjustResponse
      error?: { code: string; json: Record<string, unknown> }
    } = await response.json()

    if (json.error) {
      console.error(
        'FlowgladContext: Subscription adjustment failed',
        json
      )
      throw new Error(
        json.error.code ?? 'Subscription adjustment failed'
      )
    }

    if (!json.data) {
      throw new Error(
        'Subscription adjustment failed: no data returned'
      )
    }

    // Refetch customer billing after successful adjustment
    await queryClient.invalidateQueries({
      queryKey: [FlowgladActionKey.GetCustomerBilling],
    })

    return {
      subscription: json.data,
    }
  }

interface ConstructCreateUsageEventParams {
  baseURL: string | undefined
  betterAuthBasePath: string | undefined
  requestConfig?: RequestConfig
}

const constructCreateUsageEvent =
  (constructParams: ConstructCreateUsageEventParams) =>
  async (
    params: ClientCreateUsageEventParams
  ): Promise<
    | { usageEvent: { id: string } }
    | { error: { code: string; json: Record<string, unknown> } }
  > => {
    const { baseURL, betterAuthBasePath, requestConfig } =
      constructParams
    const headers = requestConfig?.headers
    const flowgladRoute = getFlowgladRoute(
      baseURL,
      betterAuthBasePath
    )

    const response = await fetch(
      `${flowgladRoute}/${FlowgladActionKey.CreateUsageEvent}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(params),
      }
    )

    const json = await response.json()
    if (json.error) {
      console.error(
        'FlowgladContext: Usage event creation failed',
        json
      )
      return { error: json.error }
    }
    return { usageEvent: { id: json.data.usageEvent.id } }
  }

/**
 * Configuration for all requests made to the Flowglad API
 * route.
 */
export interface RequestConfig {
  baseURL?: string
  headers?: Record<string, string>
  /**
   * Custom fetch implementation for React Native compatibility.
   * If not provided, falls back to global fetch.
   * Required in React Native environments where global fetch may not be available.
   */
  fetch?: typeof fetch
}

type CustomerBillingRouteResponse = {
  data?: CustomerBillingDetails | null
  error?: { message: string } | null
}

type PricingModelRouteResponse = {
  data?: GetPricingModelResponse | null
  error?: { code: string; json: Record<string, unknown> } | null
}

const getFetchImpl = (requestConfig?: RequestConfig) => {
  const fetchImpl =
    requestConfig?.fetch ??
    (typeof fetch !== 'undefined' ? fetch : undefined)
  if (!fetchImpl) {
    throw new Error(
      'fetch is not available. In React Native environments, provide a fetch implementation via requestConfig.fetch'
    )
  }
  return fetchImpl
}

const hasDataOrError = (
  value: unknown
): value is { data?: unknown; error?: unknown } => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return 'data' in value || 'error' in value
}

const isCustomerBillingRouteResponse = (
  value: unknown
): value is CustomerBillingRouteResponse => {
  return hasDataOrError(value)
}

const isPricingModelRouteResponse = (
  value: unknown
): value is PricingModelRouteResponse => {
  return hasDataOrError(value)
}

// Export for testing
interface FetchFlowgladParams {
  baseURL?: string
  betterAuthBasePath?: string
  requestConfig?: RequestConfig
}

export const fetchCustomerBilling = async ({
  baseURL,
  betterAuthBasePath,
  requestConfig,
}: FetchFlowgladParams): Promise<CustomerBillingRouteResponse> => {
  const fetchImpl = getFetchImpl(requestConfig)

  const flowgladRoute = getFlowgladRoute(baseURL, betterAuthBasePath)
  const response = await fetchImpl(
    `${flowgladRoute}/${FlowgladActionKey.GetCustomerBilling}`,
    {
      method:
        flowgladActionValidators[FlowgladActionKey.GetCustomerBilling]
          .method,
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
        ...requestConfig?.headers,
      },
    }
  )

  try {
    const data: unknown = await response.json()
    if (isCustomerBillingRouteResponse(data)) {
      return data
    }
    return {
      data: null,
      error: { message: 'Unexpected billing response shape' },
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Flowglad: Error fetching billing:', error)
    }
    return {
      data: null,
      error: { message: 'Failed to parse billing response JSON' },
    }
  }
}

export const fetchPricingModel = async ({
  baseURL,
  betterAuthBasePath,
  requestConfig,
}: FetchFlowgladParams): Promise<PricingModelRouteResponse> => {
  const fetchImpl = getFetchImpl(requestConfig)
  const flowgladRoute = getFlowgladRoute(baseURL, betterAuthBasePath)
  const response = await fetchImpl(
    `${flowgladRoute}/${FlowgladActionKey.GetPricingModel}`,
    {
      method:
        flowgladActionValidators[FlowgladActionKey.GetPricingModel]
          .method,
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
        ...requestConfig?.headers,
      },
    }
  )

  try {
    const data: unknown = await response.json()
    if (isPricingModelRouteResponse(data)) {
      return data
    }
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_PRICING_MODEL_RESPONSE',
        json: {
          message: 'Unexpected pricing model response shape',
        },
      },
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Flowglad: Error fetching pricing model:', error)
    }
    return {
      data: null,
      error: {
        code: 'PRICING_MODEL_JSON_PARSE_FAILED',
        json: {
          message: 'Failed to parse pricing model response JSON',
        },
      },
    }
  }
}

const getDevModeBillingMocks = (
  billingMocks: CustomerBillingDetails | undefined
) => {
  if (!billingMocks) {
    throw new Error(
      'FlowgladProvider: __devMode requires billingMocks'
    )
  }
  return billingMocks
}

const buildDevModeBillingValue = (
  billingData: CustomerBillingDetails
): LoadedFlowgladContextValues => {
  const getProduct = constructGetProduct(billingData.pricingModel)
  const getPrice = constructGetPrice(billingData.pricingModel)
  const checkFeatureAccess = constructCheckFeatureAccess(
    billingData.currentSubscriptions ?? []
  )
  const checkUsageBalance = constructCheckUsageBalance(
    billingData.currentSubscriptions ?? []
  )
  const hasPurchased = constructHasPurchased(
    billingData.pricingModel,
    billingData.purchases
  )

  return {
    loaded: true,
    errors: null,
    createCheckoutSession: () =>
      Promise.resolve({
        id: 'checkout-session-id',
        url: '',
      }),
    createAddPaymentMethodCheckoutSession: () =>
      Promise.resolve({
        id: 'checkout-session-id',
        url: '',
      }),
    createActivateSubscriptionCheckoutSession: () =>
      Promise.resolve({
        id: 'checkout-session-id',
        url: '',
      }),
    cancelSubscription: (params: CancelSubscriptionParams) => {
      const subscription =
        billingData.currentSubscriptions?.find(
          (sub) => sub.id === params.id
        ) ??
        billingData.currentSubscription ??
        billingData.subscriptions?.find((sub) => sub.id === params.id)
      if (!subscription) {
        return Promise.reject(
          new Error(
            `Dev mode: no subscription found for id "${params.id}"`
          )
        )
      }

      const now = Date.now()
      return Promise.resolve({
        subscription: {
          subscription: {
            ...subscription,
            current: false,
            status: 'canceled',
            canceledAt: now,
            cancelScheduledAt: null,
            updatedAt: now,
          },
        },
      })
    },
    uncancelSubscription: (params: UncancelSubscriptionParams) => {
      const subscription =
        billingData.currentSubscriptions?.find(
          (sub) => sub.id === params.id
        ) ??
        billingData.currentSubscription ??
        billingData.subscriptions?.find((sub) => sub.id === params.id)
      if (!subscription) {
        return Promise.reject(
          new Error(
            `Dev mode: no subscription found for id "${params.id}"`
          )
        )
      }

      const now = Date.now()
      return Promise.resolve({
        subscription: {
          subscription: {
            ...subscription,
            current: true,
            status: 'active',
            canceledAt: null,
            cancelScheduledAt: null,
            updatedAt: now,
          },
        },
      })
    },
    adjustSubscription: (params: AdjustSubscriptionParams) => {
      // In dev mode, auto-resolve subscriptionId
      let subscriptionId = params.subscriptionId
      if (!subscriptionId) {
        const currentSubs = billingData.currentSubscriptions ?? []
        if (currentSubs.length === 0) {
          return Promise.reject(
            new Error(
              'Dev mode: no active subscription found for this customer'
            )
          )
        }
        if (currentSubs.length > 1) {
          return Promise.reject(
            new Error(
              'Dev mode: customer has multiple active subscriptions. Please specify subscriptionId in params.'
            )
          )
        }
        subscriptionId = currentSubs[0].id
      }

      const subscription =
        billingData.currentSubscriptions?.find(
          (sub) => sub.id === subscriptionId
        ) ??
        billingData.currentSubscription ??
        billingData.subscriptions?.find(
          (sub) => sub.id === subscriptionId
        )
      if (!subscription) {
        return Promise.reject(
          new Error(
            `Dev mode: no subscription found for id "${subscriptionId}"`
          )
        )
      }

      const now = Date.now()
      // Note: In dev mode, subscriptionItems returns an empty array.
      // The real API returns the updated subscription items after adjustment.
      return Promise.resolve({
        subscription: {
          subscription: {
            ...subscription,
            updatedAt: now,
          },
          subscriptionItems: [],
          isUpgrade: false,
          resolvedTiming: 'immediately',
        },
      })
    },
    createUsageEvent: () =>
      Promise.resolve({
        usageEvent: { id: 'dev-usage-event-id' },
      }),
    checkFeatureAccess,
    checkUsageBalance,
    hasPurchased,
    getProduct,
    getPrice,
    reload: () => Promise.resolve(),
    customer: billingData.customer,
    subscriptions: billingData.subscriptions,
    purchases: billingData.purchases,
    invoices: billingData.invoices,
    paymentMethods: billingData.paymentMethods,
    currentSubscription: billingData.currentSubscription,
    currentSubscriptions: billingData.currentSubscriptions,
    billingPortalUrl: billingData.billingPortalUrl,
    pricingModel: billingData.pricingModel,
    // catalog is kept for SDK type compatibility (same data as pricingModel)
    catalog: billingData.catalog,
  }
}

/**
 * Hook to access billing data and actions for the current authenticated customer.
 *
 * Automatically fetches billing data when mounted. The hook returns loading state,
 * customer information, subscriptions, and action functions for managing billing.
 *
 * @returns {FlowgladContextValues} The billing context including:
 *   - `loaded`: Whether billing data has been fetched
 *   - `errors`: Any errors that occurred during fetch
 *   - `customer`: The customer object (null if not authenticated)
 *   - `subscriptions`: Array of customer subscriptions
 *   - `currentSubscription`: The primary active subscription
 *   - `pricingModel`: The pricing model with products and prices
 *   - Action functions: `createCheckoutSession`, `cancelSubscription`, `adjustSubscription`, etc.
 *
 * @example
 * ```tsx
 * function BillingPage() {
 *   const billing = useBilling()
 *
 *   if (!billing.loaded) return <Loading />
 *   if (billing.errors) return <Error errors={billing.errors} />
 *   if (!billing.customer) return <SignInPrompt />
 *
 *   return <SubscriptionDetails subscription={billing.currentSubscription} />
 * }
 * ```
 */
export const useBilling = (): FlowgladContextValues => {
  const queryClient = useQueryClient()
  const {
    baseURL,
    betterAuthBasePath,
    requestConfig,
    __devMode,
    billingMocks,
  } = useFlowgladConfig()

  // Billing fetch only occurs when this hook is mounted.
  const {
    isPending: isPendingBilling,
    error: errorBilling,
    data: billing,
  } = useQuery<CustomerBillingRouteResponse, Error>({
    queryKey: [FlowgladActionKey.GetCustomerBilling],
    enabled: !__devMode,
    queryFn: () =>
      fetchCustomerBilling({
        baseURL,
        betterAuthBasePath,
        requestConfig,
      }),
  })

  if (__devMode) {
    const billingData = getDevModeBillingMocks(billingMocks)
    return buildDevModeBillingValue(billingData)
  }

  // Each handler below gets its own Flowglad subroute, but still funnels through
  // the shared creator for validation and redirect behavior.
  const createCheckoutSession = useMemo(
    () =>
      constructCheckoutSessionCreator<FrontendProductCreateCheckoutSessionParams>(
        FlowgladActionKey.CreateCheckoutSession,
        baseURL,
        betterAuthBasePath,
        requestConfig,
        (_, basePayload) => ({
          ...basePayload,
          type: 'product',
        })
      ),
    [baseURL, betterAuthBasePath, requestConfig]
  )

  const createAddPaymentMethodCheckoutSession = useMemo(
    () =>
      constructCheckoutSessionCreator<FrontendCreateAddPaymentMethodCheckoutSessionParams>(
        FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
        baseURL,
        betterAuthBasePath,
        requestConfig
      ),
    [baseURL, betterAuthBasePath, requestConfig]
  )

  const createActivateSubscriptionCheckoutSession = useMemo(
    () =>
      constructCheckoutSessionCreator<FrontendCreateActivateSubscriptionCheckoutSessionParams>(
        FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
        baseURL,
        betterAuthBasePath,
        requestConfig
      ),
    [baseURL, betterAuthBasePath, requestConfig]
  )

  const cancelSubscription = useMemo(
    () =>
      constructCancelSubscription({
        baseURL,
        betterAuthBasePath,
        requestConfig,
        queryClient,
      }),
    [baseURL, betterAuthBasePath, requestConfig, queryClient]
  )

  const uncancelSubscription = useMemo(
    () =>
      constructUncancelSubscription({
        baseURL,
        betterAuthBasePath,
        requestConfig,
        queryClient,
      }),
    [baseURL, betterAuthBasePath, requestConfig, queryClient]
  )

  const createUsageEvent = useMemo(
    () =>
      constructCreateUsageEvent({
        baseURL,
        betterAuthBasePath,
        requestConfig,
      }),
    [baseURL, betterAuthBasePath, requestConfig]
  )

  const adjustSubscription = useMemo(
    () =>
      constructAdjustSubscription({
        baseURL,
        betterAuthBasePath,
        requestConfig,
        queryClient,
        currentSubscriptions:
          billing?.data?.currentSubscriptions ?? null,
      }),
    [
      baseURL,
      betterAuthBasePath,
      requestConfig,
      queryClient,
      billing?.data?.currentSubscriptions,
    ]
  )

  if (billing) {
    const billingError = billing.error
    const errors: Error[] = []
    if (billingError) {
      devError(
        `Flowglad route handler error: ${billingError.message}`
      )
      errors.push(new Error(billingError.message))
    }
    if (billing.data) {
      const billingData: CustomerBillingDetails = billing.data
      const reload = async () => {
        await queryClient.invalidateQueries({
          queryKey: [FlowgladActionKey.GetCustomerBilling],
        })
      }
      const getProduct = constructGetProduct(billingData.pricingModel)
      const getPrice = constructGetPrice(billingData.pricingModel)
      const hasPurchased = constructHasPurchased(
        billingData.pricingModel,
        billingData.purchases
      )
      return {
        loaded: true,
        customer: billingData.customer,
        createCheckoutSession,
        createAddPaymentMethodCheckoutSession,
        cancelSubscription,
        uncancelSubscription,
        adjustSubscription,
        createActivateSubscriptionCheckoutSession,
        createUsageEvent,
        getProduct,
        getPrice,
        hasPurchased,
        checkFeatureAccess: constructCheckFeatureAccess(
          billingData.currentSubscriptions ?? []
        ),
        checkUsageBalance: constructCheckUsageBalance(
          billingData.currentSubscriptions ?? []
        ),
        subscriptions: billingData.subscriptions,
        purchases: billingData.purchases,
        errors: null,
        reload,
        invoices: billingData.invoices,
        paymentMethods: billingData.paymentMethods,
        currentSubscription: billingData.currentSubscription,
        currentSubscriptions: billingData.currentSubscriptions,
        billingPortalUrl: billingData.billingPortalUrl,
        pricingModel: billingData.pricingModel,
        // catalog is kept for SDK type compatibility (same data as pricingModel)
        catalog: billingData.catalog,
      }
    }

    if (errors.length > 0) {
      return {
        loaded: true,
        errors,
        ...notPresentContextValues,
      }
    }

    return {
      loaded: true,
      errors: null,
      ...notPresentContextValues,
    }
  }

  if (isPendingBilling) {
    return {
      loaded: false,
      errors: null,
      ...notPresentContextValues,
    }
  }

  const errors: Error[] = [errorBilling].filter(
    (error): error is Error => error !== null
  )

  if (errors.length > 0) {
    return {
      loaded: true,
      errors,
      ...notPresentContextValues,
    }
  }

  return {
    loaded: true,
    errors: null,
    ...notPresentContextValues,
  }
}

/**
 * Hook to fetch public pricing data without requiring authentication.
 *
 * Unlike `useBilling`, this hook fetches only the pricing model (products and prices)
 * from a public endpoint. Use this for pricing pages that should be visible to
 * unauthenticated users.
 *
 * @returns {PricingModel | null} The pricing model containing products, prices, and
 *   usage meters, or null while loading or if unavailable.
 *
 * @example
 * ```tsx
 * function PricingPage() {
 *   const pricingModel = usePricingModel()
 *
 *   if (!pricingModel) return <Loading />
 *
 *   return (
 *     <div>
 *       {pricingModel.products.map(product => (
 *         <PricingCard key={product.id} product={product} />
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export const usePricingModel = (): PricingModel | null => {
  const {
    baseURL,
    betterAuthBasePath,
    requestConfig,
    __devMode,
    billingMocks,
  } = useFlowgladConfig()

  const { data: pricingData, error: pricingError } = useQuery<
    PricingModelRouteResponse,
    Error
  >({
    queryKey: [FlowgladActionKey.GetPricingModel],
    enabled: !__devMode,
    queryFn: () =>
      fetchPricingModel({
        baseURL,
        betterAuthBasePath,
        requestConfig,
      }),
  })

  if (__devMode) {
    const billingData = getDevModeBillingMocks(billingMocks)
    return billingData.pricingModel
  }

  if (pricingError) {
    devError(`Flowglad route handler error: ${pricingError.message}`)
    return null
  }

  if (pricingData?.error) {
    devError(
      `Flowglad route handler error: ${pricingData.error.code}`
    )
    return null
  }

  return pricingData?.data?.pricingModel ?? null
}

/**
 * Alias for `usePricingModel`.
 *
 * This is a convenience alias for developers who prefer a shorter hook name.
 * Functionally identical to `usePricingModel`.
 *
 * @returns {PricingModel | null} The pricing model, or null while loading or if unavailable.
 * @see usePricingModel
 */
export const usePricing = () => usePricingModel()

/**
 * @deprecated Use `usePricingModel` instead. This hook is kept for backward compatibility.
 */
export const useCatalog = () => {
  return usePricingModel()
}
