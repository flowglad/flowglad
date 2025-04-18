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
const queryClient = new QueryClient()

export interface Appearance {
  darkMode?: boolean
}

export const FlowgladProvider = ({
  children,
  loadBilling,
  serverRoute,
  requestConfig,
}: {
  children: React.ReactNode
  appearance?: Appearance
  requestConfig?: RequestConfig
  serverRoute?: string
  loadBilling: boolean
}) => {
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
