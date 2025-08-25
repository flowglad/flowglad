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
import { CustomerRetrieveBillingResponse } from '@flowglad/node/resources/customers.js'

const queryClient = new QueryClient()

export interface Appearance {
  darkMode?: boolean
}

export interface LoadedFlowgladProviderProps {
  children: React.ReactNode
  appearance?: Appearance
  requestConfig?: RequestConfig
  serverRoute?: string
  loadBilling: boolean
  theme?: FlowgladThemeConfig
  devMode: never
}

export type FlowgladProviderProps =
  | LoadedFlowgladProviderProps
  | {
      devMode: true
      billingMocks: CustomerRetrieveBillingResponse
      children: React.ReactNode
    }

export const FlowgladProvider = (props: FlowgladProviderProps) => {
  if (props.devMode) {
    return <>{props.children}</>
  }

  const { serverRoute, loadBilling, requestConfig, theme, children } =
    props
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
