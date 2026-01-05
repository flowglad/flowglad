'use client'
import type { Flowglad } from '@flowglad/node'
import {
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

const getFlowgladRoute = (baseURL?: string): string => {
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

    const flowgladRoute = getFlowgladRoute(baseURL)
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
    const { baseURL, requestConfig, queryClient } = constructParams
    const headers = requestConfig?.headers
    const flowgladRoute = getFlowgladRoute(baseURL)
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
    const { baseURL, requestConfig, queryClient } = constructParams
    const headers = requestConfig?.headers
    const flowgladRoute = getFlowgladRoute(baseURL)
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

interface ConstructCreateUsageEventParams {
  baseURL: string | undefined
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
    const { baseURL, requestConfig } = constructParams
    const headers = requestConfig?.headers
    const flowgladRoute = getFlowgladRoute(baseURL)

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
  requestConfig,
}: Pick<
  CoreFlowgladContextProviderProps,
  'baseURL' | 'requestConfig'
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

  const flowgladRoute = getFlowgladRoute(baseURL)
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
      requestConfig
    )

  const createActivateSubscriptionCheckoutSession =
    constructCheckoutSessionCreator<FrontendCreateActivateSubscriptionCheckoutSessionParams>(
      FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
      baseURL,
      requestConfig
    )

  const cancelSubscription = constructCancelSubscription({
    baseURL,
    requestConfig,
    queryClient,
  })

  const uncancelSubscription = constructUncancelSubscription({
    baseURL,
    requestConfig,
    queryClient,
  })

  const createUsageEvent = constructCreateUsageEvent({
    baseURL,
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
      value = {
        loaded: true,
        loadBilling,
        customer: billingData.customer,
        createCheckoutSession,
        createAddPaymentMethodCheckoutSession,
        cancelSubscription,
        uncancelSubscription,
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
