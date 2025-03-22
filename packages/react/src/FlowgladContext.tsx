'use client'
import React, { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  createCheckoutSessionSchema,
  FlowgladActionKey,
  flowgladActionValidators,
} from '@flowglad/shared'
import type { Flowglad } from '@flowglad/node'
import { validateUrl } from './utils'
import { FlowgladTheme } from './FlowgladTheme'

export type LoadedFlowgladContextValues =
  Flowglad.CustomerRetrieveBillingResponse & {
    loaded: true
    loadBilling: true
    createCheckoutSession: (
      params: z.infer<typeof createCheckoutSessionSchema> & {
        autoRedirect?: boolean
      }
    ) => Promise<
      | {
          id: string
          url: string
        }
      | { error: { code: string; json: Record<string, unknown> } }
    >
    errors: null
  }

export interface NonPresentContextValues {
  customer: null
  subscriptions: null
  createCheckoutSession: null
  catalog: null
  invoices: []
  paymentMethods: []
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
  catalog: null,
  invoices: [],
  paymentMethods: [],
}

const FlowgladContext = createContext<FlowgladContextValues>({
  loaded: false,
  loadBilling: false,
  errors: null,
  ...notPresentContextValues,
})

interface ConstructCreateCheckoutSessionParams {
  flowgladRoute: string
  requestConfig?: RequestConfig
}

const constructCreateCheckoutSession =
  (constructParams: ConstructCreateCheckoutSessionParams) =>
  async (
    params: Parameters<
      LoadedFlowgladContextValues['createCheckoutSession']
    >[0]
  ): Promise<
    | {
        id: string
        url: string
      }
    | { error: { code: string; json: Record<string, unknown> } }
  > => {
    const { flowgladRoute, requestConfig } = constructParams
    validateUrl(params.successUrl, 'successUrl')
    validateUrl(params.cancelUrl, 'cancelUrl')
    validateUrl(flowgladRoute, 'flowgladRoute')
    const headers = requestConfig?.headers
    const response = await fetch(
      `${flowgladRoute}/${FlowgladActionKey.CreateCheckoutSession}`,
      {
        method:
          flowgladActionValidators[
            FlowgladActionKey.CreateCheckoutSession
          ].method,
        body: JSON.stringify(params),
        headers,
      }
    )
    const json: {
      data: Flowglad.CheckoutSessions.CheckoutSessionCreateResponse
      error?: { code: string; json: Record<string, unknown> }
    } = await response.json()
    const data = json.data
    if (json.error) {
      console.error(
        'FlowgladContext: Purchase session creation failed',
        json
      )
      return {
        error: json.error!,
      }
    }
    if (params.autoRedirect) {
      window.location.href = data.url
    }
    return {
      id: data.checkoutSession.id,
      url: data.url,
    }
  }

/**
 * Configuration for all requests made to the Flowglad API
 * route.
 */
export interface RequestConfig {
  serverRoute?: string
  headers?: Record<string, string>
}

export const FlowgladContextProvider = ({
  children,
  serverRoute = '/api/flowglad',
  loadBilling,
  requestConfig,
  darkMode,
}: {
  loadBilling?: boolean
  darkMode?: boolean
  serverRoute?: string
  requestConfig?: RequestConfig
  children: React.ReactNode
}) => {
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
    enabled: loadBilling,
    queryFn: async () => {
      const response = await fetch(
        `${serverRoute}/${FlowgladActionKey.GetCustomerBilling}`,
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

  const createCheckoutSession = constructCreateCheckoutSession({
    flowgladRoute: serverRoute,
    requestConfig,
  })

  let value: FlowgladContextValues

  if (!loadBilling) {
    value = {
      loaded: true,
      loadBilling: loadBilling ?? false,
      errors: null,
      ...notPresentContextValues,
    }
  } else if (billing) {
    value = {
      loaded: true,
      loadBilling,
      customer: billing.data.customer,
      createCheckoutSession,
      catalog: billing.data.catalog,
      subscriptions: billing.data.subscriptions,
      errors: null,
      invoices: billing.data.invoices,
      paymentMethods: billing.data.paymentMethods,
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
      <FlowgladTheme darkMode={darkMode}>{children}</FlowgladTheme>
    </FlowgladContext.Provider>
  )
}

export const useBilling = () => useContext(FlowgladContext)

export const useCatalog = () => {
  const { catalog } = useBilling()
  return catalog
}
