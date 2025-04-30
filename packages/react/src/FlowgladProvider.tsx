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
import { FlowgladTheme } from './FlowgladTheme'
import { FlowgladThemeConfig } from './lib/themes'

const queryClient = new QueryClient()

export interface Appearance {
  darkMode?: boolean
}

export const FlowgladProvider = ({
  children,
  loadBilling,
  serverRoute,
  requestConfig,
  theme,
}: {
  children: React.ReactNode
  appearance?: Appearance
  requestConfig?: RequestConfig
  serverRoute?: string
  loadBilling: boolean
  theme?: FlowgladThemeConfig
}) => {
  validateUrl(serverRoute, 'serverRoute', true)
  return (
    <QueryClientProvider client={queryClient}>
      <FlowgladContextProvider
        serverRoute={serverRoute}
        loadBilling={loadBilling}
        requestConfig={requestConfig}
      >
        <FlowgladTheme theme={theme}>{children}</FlowgladTheme>
      </FlowgladContextProvider>
    </QueryClientProvider>
  )
}

export default FlowgladProvider
