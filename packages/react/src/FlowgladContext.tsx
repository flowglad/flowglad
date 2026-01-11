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
  type UncancelSubscriptionParams,
} from '@flowglad/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type React from 'react'
import { createContext, useContext } from 'react'
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
const getFlowgladRoute = (
  baseURL?: string,
  betterAuthBasePath?: string
): string => {
  if (betterAuthBasePath) {
    // Better Auth routes are under {basePath}/flowglad
    return `${betterAuthBasePath}/flowglad`
  }
  return baseURL ? `${baseURL}/api/flowglad` : '/api/flowglad'
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
  loadBilling: true
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
   *   timing: 'at_end_of_period'
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
   * @param params.timing - 'immediately' | 'at_end_of_period' | 'auto' (default: 'auto')
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
  loadBilling: boolean
  errors: null
}

export interface NotAuthenticatedFlowgladContextValues
  extends NonPresentContextValues {
  loaded: true
  loadBilling: false
  errors: null
}

export interface ErrorFlowgladContextValues
  extends NonPresentContextValues {
  loaded: true
  loadBilling: boolean
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

const FlowgladContext = createContext<FlowgladContextValues>({
  loaded: false,
  loadBilling: false,
  errors: null,
  ...notPresentContextValues,
})

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

interface CoreFlowgladContextProviderProps {
  loadBilling?: boolean
  baseURL?: string
  /**
   * When using Better Auth integration, set this to your Better Auth API base path
   * (e.g., '/api/auth'). This routes all Flowglad API calls through Better Auth
   * endpoints instead of the standalone /api/flowglad route.
   *
   * IMPORTANT: This must match your Better Auth configuration. If you change your
   * Better Auth basePath, you must update this prop to match.
   */
  betterAuthBasePath?: string
  requestConfig?: RequestConfig
  children: React.ReactNode
}

/**
 * This is a special case for development mode,
 * used for developing UI powered by useBilling()
 */
interface DevModeFlowgladContextProviderProps {
  billingMocks: CustomerBillingDetails
  children: React.ReactNode
  __devMode: true
}

type FlowgladContextProviderProps =
  | CoreFlowgladContextProviderProps
  | DevModeFlowgladContextProviderProps

type CustomerBillingRouteResponse = {
  data?: CustomerBillingDetails | null
  error?: { message: string } | null
}

const isDevModeProps = (
  props: FlowgladContextProviderProps
): props is DevModeFlowgladContextProviderProps => {
  return '__devMode' in props
}

const fetchCustomerBilling = async ({
  baseURL,
  betterAuthBasePath,
  requestConfig,
}: Pick<
  CoreFlowgladContextProviderProps,
  'baseURL' | 'betterAuthBasePath' | 'requestConfig'
>): Promise<CustomerBillingRouteResponse> => {
  // Use custom fetch if provided (for React Native), otherwise use global fetch
  const fetchImpl =
    requestConfig?.fetch ??
    (typeof fetch !== 'undefined' ? fetch : undefined)
  if (!fetchImpl) {
    throw new Error(
      'fetch is not available. In React Native environments, provide a fetch implementation via requestConfig.fetch'
    )
  }

  const flowgladRoute = getFlowgladRoute(baseURL, betterAuthBasePath)
  const response = await fetchImpl(
    `${flowgladRoute}/${FlowgladActionKey.GetCustomerBilling}`,
    {
      method:
        flowgladActionValidators[FlowgladActionKey.GetCustomerBilling]
          .method,
      body: JSON.stringify({}),
      headers: requestConfig?.headers,
    }
  )

  try {
    const data: unknown = await response.json()
    if (
      typeof data === 'object' &&
      data !== null &&
      ('data' in data || 'error' in data)
    ) {
      return data as CustomerBillingRouteResponse
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

export const FlowgladContextProvider = (
  props: FlowgladContextProviderProps
) => {
  const queryClient = useQueryClient()
  const devModeProps = isDevModeProps(props) ? props : null
  const coreProps = isDevModeProps(props) ? null : props
  const isDevMode = devModeProps !== null
  // In a perfect world, this would be a useMutation hook rather than useQuery.
  // Because technically, billing fetch requests run a "find or create" operation on
  // the customer. But useQuery allows us to execute the call using `enabled`
  // which allows us to avoid maintaining a useEffect hook.
  const {
    isPending: isPendingBilling,
    error: errorBilling,
    data: billing,
  } = useQuery<CustomerBillingRouteResponse | null>({
    queryKey: [FlowgladActionKey.GetCustomerBilling],
    enabled: Boolean(coreProps?.loadBilling),
    queryFn: coreProps
      ? () =>
          fetchCustomerBilling({
            baseURL: coreProps.baseURL,
            betterAuthBasePath: coreProps.betterAuthBasePath,
            requestConfig: coreProps.requestConfig,
          })
      : async () => null,
  })

  if (isDevMode) {
    const billingData = devModeProps.billingMocks
    const getProduct = constructGetProduct(billingData.catalog)
    const getPrice = constructGetPrice(billingData.catalog)
    const checkFeatureAccess = constructCheckFeatureAccess(
      billingData.currentSubscriptions ?? []
    )
    const checkUsageBalance = constructCheckUsageBalance(
      billingData.currentSubscriptions ?? []
    )
    const hasPurchased = constructHasPurchased(
      billingData.catalog,
      billingData.purchases
    )

    return (
      <FlowgladContext.Provider
        value={{
          loaded: true,
          loadBilling: true,
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
              billingData.subscriptions?.find(
                (sub) => sub.id === params.id
              )
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
          uncancelSubscription: (
            params: UncancelSubscriptionParams
          ) => {
            const subscription =
              billingData.currentSubscriptions?.find(
                (sub) => sub.id === params.id
              ) ??
              billingData.currentSubscription ??
              billingData.subscriptions?.find(
                (sub) => sub.id === params.id
              )
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
              const currentSubs =
                billingData.currentSubscriptions ?? []
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
          catalog: billingData.catalog,
          billingPortalUrl: billingData.billingPortalUrl,
          pricingModel: billingData.pricingModel,
        }}
      >
        {props.children}
      </FlowgladContext.Provider>
    )
  }

  if (!coreProps) {
    throw new Error('FlowgladContextProvider: missing core props')
  }

  const {
    baseURL,
    betterAuthBasePath,
    requestConfig,
    loadBilling: loadBillingProp,
  } = coreProps
  const loadBilling = loadBillingProp ?? false
  // Each handler below gets its own Flowglad subroute, but still funnels through
  // the shared creator for validation and redirect behavior.
  const createCheckoutSession =
    constructCheckoutSessionCreator<FrontendProductCreateCheckoutSessionParams>(
      FlowgladActionKey.CreateCheckoutSession,
      baseURL,
      betterAuthBasePath,
      requestConfig,
      (_, basePayload) => ({
        ...basePayload,
        type: 'product',
      })
    )

  const createAddPaymentMethodCheckoutSession =
    constructCheckoutSessionCreator<FrontendCreateAddPaymentMethodCheckoutSessionParams>(
      FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
      baseURL,
      betterAuthBasePath,
      requestConfig
    )

  const createActivateSubscriptionCheckoutSession =
    constructCheckoutSessionCreator<FrontendCreateActivateSubscriptionCheckoutSessionParams>(
      FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
      baseURL,
      betterAuthBasePath,
      requestConfig
    )

  const cancelSubscription = constructCancelSubscription({
    baseURL,
    betterAuthBasePath,
    requestConfig,
    queryClient,
  })

  const uncancelSubscription = constructUncancelSubscription({
    baseURL,
    betterAuthBasePath,
    requestConfig,
    queryClient,
  })

  const createUsageEvent = constructCreateUsageEvent({
    baseURL,
    betterAuthBasePath,
    requestConfig,
  })

  let value: FlowgladContextValues
  if (!loadBilling) {
    value = {
      loaded: true,
      loadBilling,
      errors: null,
      ...notPresentContextValues,
    }
  } else if (billing) {
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
      const getProduct = constructGetProduct(billingData.catalog)
      const getPrice = constructGetPrice(billingData.catalog)
      const hasPurchased = constructHasPurchased(
        billingData.catalog,
        billingData.purchases
      )
      const adjustSubscription = constructAdjustSubscription({
        baseURL,
        betterAuthBasePath,
        requestConfig,
        queryClient,
        currentSubscriptions:
          billingData.currentSubscriptions ?? null,
      })
      value = {
        loaded: true,
        loadBilling,
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
        catalog: billingData.catalog,
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
      }
    } else {
      value = {
        loaded: true,
        loadBilling,
        errors,
        ...notPresentContextValues,
      }
    }
  } else if (isPendingBilling) {
    value = {
      loaded: false,
      loadBilling,
      errors: null,
      ...notPresentContextValues,
    }
  } else {
    const errors: Error[] = [errorBilling].filter(
      (error): error is Error => error !== null
    )
    value = {
      loaded: true,
      loadBilling,
      errors,
      ...notPresentContextValues,
    }
  }

  return (
    <FlowgladContext.Provider value={value}>
      {props.children}
    </FlowgladContext.Provider>
  )
}

export const useBilling = () => useContext(FlowgladContext)

export const useCatalog = () => {
  const { catalog } = useBilling()
  return catalog
}
