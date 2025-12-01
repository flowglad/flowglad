'use client'
import React, { createContext, useContext } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FlowgladActionKey,
  flowgladActionValidators,
  type CancelSubscriptionParams,
  type CreateActivateSubscriptionCheckoutSessionParams,
  type CreateAddPaymentMethodCheckoutSessionParams,
  constructCheckFeatureAccess,
  constructCheckUsageBalance,
  type BillingWithChecks,
  constructGetProduct,
  constructGetPrice,
  type CustomerBillingDetails,
  type CreateProductCheckoutSessionParams,
} from '@flowglad/shared'
import type { Flowglad } from '@flowglad/node'
import { validateUrl } from './utils'
import { devError } from './lib/utils'

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
  createCheckoutSession: (
    params: FrontendProductCreateCheckoutSessionParams
  ) => Promise<CreateCheckoutSessionResponse>
  createAddPaymentMethodCheckoutSession: (
    params: FrontendCreateAddPaymentMethodCheckoutSessionParams
  ) => Promise<CreateCheckoutSessionResponse>
  createActivateSubscriptionCheckoutSession: (
    params: FrontendCreateActivateSubscriptionCheckoutSessionParams
  ) => Promise<CreateCheckoutSessionResponse>
  errors: null
}

export interface NonPresentContextValues {
  customer: null
  subscriptions: null
  createCheckoutSession: null
  createAddPaymentMethodCheckoutSession: null
  createActivateSubscriptionCheckoutSession: null
  checkFeatureAccess: null
  checkUsageBalance: null
  pricingModel: null
  billingPortalUrl: null
  reload: null
  catalog: null
  invoices: []
  paymentMethods: []
  purchases: []
  cancelSubscription: null
  currentSubscriptions: []
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
  checkFeatureAccess: null,
  checkUsageBalance: null,
  pricingModel: null,
  billingPortalUrl: null,
  reload: null,
  catalog: null,
  invoices: [],
  paymentMethods: [],
  purchases: [],
  cancelSubscription: null,
  currentSubscriptions: [],
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
    flowgladRoute: string,
    requestConfig?: RequestConfig,
    mapPayload?: (
      params: TParams,
      basePayload: Omit<TParams, 'autoRedirect'>
    ) => Record<string, unknown>
  ) =>
  async (params: TParams): Promise<CreateCheckoutSessionResponse> => {
    validateUrl(params.successUrl, 'successUrl')
    validateUrl(params.cancelUrl, 'cancelUrl')
    validateUrl(flowgladRoute, 'flowgladRoute', true)

    const headers = requestConfig?.headers
    const { autoRedirect, ...basePayload } = params
    // The mapPayload hook lets each caller tweak the server payload without
    // duplicating the core request logic.
    const payload =
      mapPayload?.(params, basePayload) ??
      (basePayload as Record<string, unknown>)

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
  flowgladRoute: string
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
    const { flowgladRoute, requestConfig, queryClient } =
      constructParams
    const headers = requestConfig?.headers
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

/**
 * Configuration for all requests made to the Flowglad API
 * route.
 */
export interface RequestConfig {
  serverRoute?: string
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
  serverRoute?: string
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

export const FlowgladContextProvider = (
  props: FlowgladContextProviderProps
) => {
  const queryClient = useQueryClient()
  const isDevMode = '__devMode' in props
  // In a perfect world, this would be a useMutation hook rather than useQuery.
  // Because technically, billing fetch requests run a "find or create" operation on
  // the customer. But useQuery allows us to execute the call using `enabled`
  // which allows us to avoid maintaining a useEffect hook.
  const {
    isPending: isPendingBilling,
    error: errorBilling,
    data: billing,
  } = useQuery({
    queryKey: [FlowgladActionKey.GetCustomerBilling],
    enabled: isDevMode ? false : props.loadBilling,
    queryFn: async () => {
      if (isDevMode) {
        return props.billingMocks
      }
      const requestConfig = (
        props as CoreFlowgladContextProviderProps
      ).requestConfig
      // Use custom fetch if provided (for React Native), otherwise use global fetch
      const fetchImpl =
        requestConfig?.fetch ??
        (typeof fetch !== 'undefined' ? fetch : undefined)
      if (!fetchImpl) {
        throw new Error(
          'fetch is not available. In React Native environments, provide a fetch implementation via requestConfig.fetch'
        )
      }
      const response = await fetchImpl(
        `${props.serverRoute ?? '/api/flowglad'}/${FlowgladActionKey.GetCustomerBilling}`,
        {
          method:
            flowgladActionValidators[
              FlowgladActionKey.GetCustomerBilling
            ].method,
          body: JSON.stringify({}),
          headers: requestConfig?.headers,
        }
      )
      const data = await response.json()
      return data
    },
  })

  if (isDevMode) {
    const billingData = props.billingMocks
    const getProduct = constructGetProduct(billingData.catalog)
    const getPrice = constructGetPrice(billingData.catalog)
    const checkFeatureAccess = constructCheckFeatureAccess(
      billingData.currentSubscriptions ?? []
    )
    const checkUsageBalance = constructCheckUsageBalance(
      billingData.currentSubscriptions ?? []
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
          cancelSubscription: () =>
            Promise.resolve({
              subscription: {
                id: 'sub_123',
                status: 'canceled',
                canceledAt: new Date().toISOString(),
              } as any,
            }),
          checkFeatureAccess,
          checkUsageBalance,
          getProduct,
          getPrice,
          reload: () => Promise.resolve(),
          customer: billingData.customer,
          subscriptions: billingData.subscriptions,
          purchases: billingData.purchases,
          invoices: billingData.invoices,
          paymentMethods: billingData.paymentMethods,
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

  const {
    serverRoute: serverRouteProp,
    requestConfig,
    loadBilling: loadBillingProp,
  } = props as CoreFlowgladContextProviderProps
  const serverRoute = serverRouteProp ?? '/api/flowglad'
  const loadBilling = loadBillingProp ?? false
  // Each handler below gets its own Flowglad subroute, but still funnels through
  // the shared creator for validation and redirect behavior.
  const createCheckoutSession =
    constructCheckoutSessionCreator<FrontendProductCreateCheckoutSessionParams>(
      FlowgladActionKey.CreateCheckoutSession,
      serverRoute,
      requestConfig,
      (_, basePayload) => ({
        ...basePayload,
        type: 'product',
      })
    )

  const createAddPaymentMethodCheckoutSession =
    constructCheckoutSessionCreator<FrontendCreateAddPaymentMethodCheckoutSessionParams>(
      FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
      serverRoute,
      requestConfig
    )

  const createActivateSubscriptionCheckoutSession =
    constructCheckoutSessionCreator<FrontendCreateActivateSubscriptionCheckoutSessionParams>(
      FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
      serverRoute,
      requestConfig
    )

  const cancelSubscription = constructCancelSubscription({
    flowgladRoute: serverRoute,
    requestConfig,
    queryClient,
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
      value = {
        loaded: true,
        loadBilling,
        customer: billingData.customer,
        createCheckoutSession,
        createAddPaymentMethodCheckoutSession,
        cancelSubscription,
        createActivateSubscriptionCheckoutSession,
        getProduct,
        getPrice,
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
