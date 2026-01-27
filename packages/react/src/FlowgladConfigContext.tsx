'use client'
import type { CustomerBillingDetails } from '@flowglad/shared'
import type React from 'react'
import { createContext, useContext } from 'react'
import type { RequestConfig } from './FlowgladContext'

/**
 * Internal configuration context for Flowglad hooks.
 * Provides access to baseURL, requestConfig, and devMode settings
 * that hooks need to make API calls.
 */
export interface FlowgladConfigContextValues {
  /** Base URL for API calls */
  baseURL: string | undefined
  /** Better Auth base path for routing */
  betterAuthBasePath: string | undefined
  /** Request configuration including headers and custom fetch */
  requestConfig: RequestConfig | undefined
  /** Whether dev mode is enabled (returns mock data) */
  __devMode: boolean
  /** Dev mode billing data for mock responses */
  billingMocks: CustomerBillingDetails | undefined
}

const defaultConfigContextValues: FlowgladConfigContextValues = {
  baseURL: undefined,
  betterAuthBasePath: undefined,
  requestConfig: undefined,
  __devMode: false,
  billingMocks: undefined,
}

const FlowgladConfigContext =
  createContext<FlowgladConfigContextValues>(
    defaultConfigContextValues
  )

export interface FlowgladConfigProviderProps {
  children: React.ReactNode
  baseURL?: string
  betterAuthBasePath?: string
  requestConfig?: RequestConfig
  __devMode?: boolean
  billingMocks?: CustomerBillingDetails
}

/**
 * Internal provider for Flowglad configuration.
 * Used by FlowgladProvider to expose config to standalone hooks.
 */
export const FlowgladConfigProvider = ({
  children,
  baseURL,
  betterAuthBasePath,
  requestConfig,
  __devMode = false,
  billingMocks,
}: FlowgladConfigProviderProps) => {
  return (
    <FlowgladConfigContext.Provider
      value={{
        baseURL,
        betterAuthBasePath,
        requestConfig,
        __devMode,
        billingMocks,
      }}
    >
      {children}
    </FlowgladConfigContext.Provider>
  )
}

/**
 * Hook to access Flowglad configuration values.
 * For internal use by Flowglad hooks.
 */
export const useFlowgladConfig = (): FlowgladConfigContextValues => {
  return useContext(FlowgladConfigContext)
}
