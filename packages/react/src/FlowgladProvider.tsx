'use client'
import React from 'react'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  FlowgladContextProvider,
  RequestConfig,
} from './FlowgladContext'
import { validateUrl } from './utils'
import { CustomerBillingDetails } from '@flowglad/types'

const queryClient = new QueryClient()

export interface Appearance {
  darkMode?: boolean
}

export interface LoadedFlowgladProviderProps {
  children: React.ReactNode
  requestConfig?: RequestConfig
  serverRoute?: string
  loadBilling: boolean
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

  const { serverRoute, loadBilling, requestConfig, children } =
    props as LoadedFlowgladProviderProps
  validateUrl(serverRoute, 'serverRoute', true)
  return (
    <QueryClientProvider client={queryClient}>
      <FlowgladContextProvider
        serverRoute={serverRoute}
        loadBilling={loadBilling}
        requestConfig={requestConfig}
      >
        {children}
      </FlowgladContextProvider>
    </QueryClientProvider>
  )
}

export default FlowgladProvider
