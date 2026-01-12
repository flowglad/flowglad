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

export interface LoadedFlowgladProviderProps {
  children: React.ReactNode
  requestConfig?: RequestConfig
  baseURL?: string
  /**
   * @deprecated No longer needed. Billing now loads lazily when useBilling() is called.
   */
  loadBilling?: boolean
}

interface DevModeFlowgladProviderProps {
  __devMode: true
  billingMocks: CustomerBillingDetails
  children: React.ReactNode
}

export type FlowgladProviderProps =
  | LoadedFlowgladProviderProps
  | DevModeFlowgladProviderProps

export const FlowgladProvider = (props: FlowgladProviderProps) => {
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
    props as LoadedFlowgladProviderProps
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
