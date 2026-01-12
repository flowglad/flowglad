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

export interface FlowgladProviderPropsCore {
  children: React.ReactNode
  requestConfig?: RequestConfig
  baseURL?: string
  /**
   * @deprecated The loadBilling prop is no longer needed. Billing data will be fetched
   * lazily when useBilling() is called. This prop will be removed in a future version.
   */
  loadBilling?: boolean
}

/**
 * @deprecated Use FlowgladProviderPropsCore instead
 */
export type LoadedFlowgladProviderProps = FlowgladProviderPropsCore

interface DevModeFlowgladProviderProps {
  __devMode: true
  billingMocks: CustomerBillingDetails
  children: React.ReactNode
}

export type FlowgladProviderProps =
  | FlowgladProviderPropsCore
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

  const { baseURL, loadBilling, requestConfig, children } =
    props as FlowgladProviderPropsCore

  // Deprecation warning for loadBilling prop
  if (loadBilling !== undefined && typeof console !== 'undefined') {
    console.warn(
      '[Flowglad] The loadBilling prop is deprecated and will be removed in a future version. ' +
        'Billing data is now fetched lazily when useBilling() is called. You can safely remove this prop.'
    )
  }

  if (baseURL) {
    validateUrl(baseURL, 'baseURL', true)
  }
  return (
    <QueryClientProvider client={queryClient}>
      <FlowgladContextProvider
        baseURL={baseURL}
        loadBilling={loadBilling}
        requestConfig={requestConfig}
      >
        {children}
      </FlowgladContextProvider>
    </QueryClientProvider>
  )
}

export default FlowgladProvider
