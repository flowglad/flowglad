'use client'
import type { CustomerBillingDetails } from '@flowglad/shared'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import { type RequestConfig } from './FlowgladContext'
import { validateUrl } from './utils'

const queryClient = new QueryClient()

export interface LoadedFlowgladProviderProps {
  children: React.ReactNode
  requestConfig?: RequestConfig
  baseURL?: string
  /**
   * When using Better Auth integration, set this to your Better Auth API base path
   * (e.g., '/api/auth'). This routes all Flowglad API calls through Better Auth
   * endpoints instead of the standalone /api/flowglad route.
   *
   * IMPORTANT: This must match your Better Auth configuration. If you change your
   * Better Auth basePath, you must update this prop to match.
   */
  betterAuthBasePath?: string
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
        <FlowgladConfigProvider
          __devMode
          billingMocks={props.billingMocks}
        >
          {props.children}
        </FlowgladConfigProvider>
      </QueryClientProvider>
    )
  }

  const { baseURL, betterAuthBasePath, requestConfig, children } =
    props
  if (baseURL) {
    validateUrl(baseURL, 'baseURL', true)
  }
  if (betterAuthBasePath) {
    validateUrl(betterAuthBasePath, 'betterAuthBasePath', true)
  }
  return (
    <QueryClientProvider client={queryClient}>
      <FlowgladConfigProvider
        baseURL={baseURL}
        betterAuthBasePath={betterAuthBasePath}
        requestConfig={requestConfig}
      >
        {children}
      </FlowgladConfigProvider>
    </QueryClientProvider>
  )
}

export default FlowgladProvider
