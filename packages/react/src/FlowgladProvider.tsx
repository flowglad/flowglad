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
import { FlowgladThemeProvider } from './FlowgladTheme'
import { FlowgladThemeConfig } from './lib/themes'
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
  theme?: FlowgladThemeConfig
}

interface DevModeFlowgladProviderProps {
  __devMode: true
  theme?: FlowgladThemeConfig
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

  const { serverRoute, loadBilling, requestConfig, theme, children } =
    props as LoadedFlowgladProviderProps
  validateUrl(serverRoute, 'serverRoute', true)
  return (
    <QueryClientProvider client={queryClient}>
      <FlowgladContextProvider
        serverRoute={serverRoute}
        loadBilling={loadBilling}
        requestConfig={requestConfig}
      >
        <FlowgladThemeProvider theme={theme}>
          {children}
        </FlowgladThemeProvider>
      </FlowgladContextProvider>
    </QueryClientProvider>
  )
}

export default FlowgladProvider
