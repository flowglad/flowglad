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

type LoadedFlowgladContextValues = {
  loaded: true
  loadBilling: true
  customerProfile: Flowglad.CustomerProfiles.CustomerProfileRetrieveBillingResponse.CustomerProfile
  subscriptions: Flowglad.CustomerProfiles.CustomerProfileRetrieveBillingResponse.Subscription[]
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
  catalog: Flowglad.CustomerProfiles.CustomerProfileRetrieveBillingResponse.Catalog
  errors: null
}

interface NonPresentContextValues {
  customerProfile: null
  subscriptions: null
  createCheckoutSession: null
  catalog: null
}
interface NotLoadedFlowgladContextValues
  extends NonPresentContextValues {
  loaded: false
  loadBilling: boolean
  errors: null
}

interface NotAuthenticatedFlowgladContextValues
  extends NonPresentContextValues {
  loaded: true
  loadBilling: false
  errors: null
}

interface ErrorFlowgladContextValues extends NonPresentContextValues {
  loaded: true
  loadBilling: boolean
  errors: Error[]
}

type FlowgladContextValues =
  | LoadedFlowgladContextValues
  | NotLoadedFlowgladContextValues
  | NotAuthenticatedFlowgladContextValues
  | ErrorFlowgladContextValues

const notPresentContextValues = {
  customerProfile: null,
  subscriptions: null,
  createCheckoutSession: null,
  catalog: null,
} as const
const FlowgladContext = createContext<FlowgladContextValues>({
  loaded: false,
  loadBilling: false,
  errors: null,
  ...notPresentContextValues,
})

const constructCreateCheckoutSession =
  (flowgladRoute: string) =>
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
    validateUrl(params.successUrl, 'successUrl')
    validateUrl(params.cancelUrl, 'cancelUrl')
    const response = await fetch(
      `${flowgladRoute}/${FlowgladActionKey.CreateCheckoutSession}`,
      {
        method:
          flowgladActionValidators[
            FlowgladActionKey.CreateCheckoutSession
          ].method,
        body: JSON.stringify(params),
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

export const FlowgladContextProvider = ({
  children,
  serverRoute = '/api/flowglad',
  cancelUrl,
  successUrl,
  loadBilling,
  darkMode,
}: {
  loadBilling?: boolean
  darkMode?: boolean
  customerProfile?: {
    externalId: string
    email: string
    name: string
  }
  serverRoute?: string
  cancelUrl?: string
  successUrl?: string
  children: React.ReactNode
}) => {
  // In a perfect world, this would be a useMutation hook rather than useQuery.
  // Because technically, billing fetch requests run a "find or create" operation on
  // the customer profile. But useQuery allows us to execute the call using `enabled`
  // which allows us to avoid maintaining a useEffect hook.
  const {
    isPending: isPendingBilling,
    error: errorBilling,
    data: billing,
  } = useQuery({
    queryKey: [FlowgladActionKey.GetCustomerProfileBilling],
    enabled: loadBilling,
    queryFn: async () => {
      const response = await fetch(
        `${serverRoute}/${FlowgladActionKey.GetCustomerProfileBilling}`,
        {
          method:
            flowgladActionValidators[
              FlowgladActionKey.GetCustomerProfileBilling
            ].method,
          body: JSON.stringify({}),
        }
      )
      const data = await response.json()
      return data
    },
  })
  const createCheckoutSession =
    constructCreateCheckoutSession(serverRoute)

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
      customerProfile: billing.data.customerProfile,
      createCheckoutSession,
      catalog: billing.data.catalog,
      subscriptions: billing.data.subscriptions,
      errors: null,
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

export const useBilling = () => {
  const billing = useContext(FlowgladContext)
  if (!billing.loadBilling) {
    throw new Error(
      'Flowglad: Attempted to access billing data while `loadBilling` property is not `true`. Ensure that the FlowgladProvider `loadBilling` property is set to true.'
    )
  }
  return billing
}
