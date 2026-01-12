'use client'
import type { CustomerBillingDetails } from '@flowglad/shared'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import type React from 'react'
import {
  FlowgladContextProvider,
  type RequestConfig,
} from './FlowgladContext'
import { validateUrl } from './utils'

const queryClient = new QueryClient()

export interface FlowgladProviderProps {
  children: React.ReactNode
  requestConfig?: RequestConfig
  baseURL?: string
  /**
   * @deprecated No longer needed. Billing now loads lazily when useBilling() is called.
   */
  loadBilling?: boolean
}

/** @deprecated Use FlowgladProviderProps instead */
export type LoadedFlowgladProviderProps = FlowgladProviderProps

interface DevModeFlowgladProviderProps {
  __devMode: true
  billingMocks: CustomerBillingDetails
  children: React.ReactNode
}

export type FlowgladProviderAllProps =
  | FlowgladProviderProps
  | DevModeFlowgladProviderProps

export const FlowgladProvider = (props: FlowgladProviderAllProps) => {
  // Emit deprecation warning if loadBilling is passed
  if (!('__devMode' in props) && 'loadBilling' in props) {
    console.warn(
      'FlowgladProvider: loadBilling prop is deprecated and no longer needed. ' +
        'Billing now loads lazily when useBilling() is called.'
    )
  }

  if ('__devMode' in props) {
    return (
      <QueryClientProvider client={queryClient}>
        <FlowgladContextProvider
          __devMode
          billingMocks={props.billingMocks}
        >
          {props.children}
        </FlowgladContextProvider>
      </QueryClientProvider>
    )
  }

  const { baseURL, requestConfig, children } =
    props as FlowgladProviderProps
  if (baseURL) {
    validateUrl(baseURL, 'baseURL', true)
  }
  return (
    <QueryClientProvider client={queryClient}>
      <FlowgladContextProvider
        baseURL={baseURL}
        requestConfig={requestConfig}
      >
        {children}
      </FlowgladContextProvider>
    </QueryClientProvider>
  )
}

export default FlowgladProvider
