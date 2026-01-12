import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { render, renderHook } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FlowgladContextProvider } from './FlowgladContext'
import type {
  FlowgladProviderProps,
  LoadedFlowgladProviderProps,
} from './FlowgladProvider'
import * as FlowgladReact from './index'
import { useBilling } from './index'

// Helper to create a fresh QueryClient for each test
const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

// Type for the fetch mock
type MockFetch = typeof fetch

describe('FlowgladProvider without loadBilling prop', () => {
  it('renders children when FlowgladProvider has no loadBilling prop', () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    }) as unknown as MockFetch

    const queryClient = createQueryClient()
    let rendered = false

    const TestChild = () => {
      rendered = true
      return <div>Child content</div>
    }

    render(
      <QueryClientProvider client={queryClient}>
        <FlowgladContextProvider requestConfig={{ fetch: mockFetch }}>
          <TestChild />
        </FlowgladContextProvider>
      </QueryClientProvider>
    )

    expect(rendered).toBe(true)
  })

  it('allows useBilling to function without loadBilling prop', () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    }) as unknown as MockFetch

    const queryClient = createQueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FlowgladContextProvider requestConfig={{ fetch: mockFetch }}>
          {children}
        </FlowgladContextProvider>
      </QueryClientProvider>
    )

    const { result } = renderHook(() => useBilling(), { wrapper })

    // useBilling should work without loadBilling prop
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isPending')
    expect(result.current).toHaveProperty('refetch')
  })

  it('logs console.warn with message containing "loadBilling prop is deprecated" when loadBilling={true} is passed', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {})
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    }) as unknown as MockFetch

    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <FlowgladContextProvider
          loadBilling={true}
          requestConfig={{ fetch: mockFetch }}
        >
          <div>Child</div>
        </FlowgladContextProvider>
      </QueryClientProvider>
    )

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('loadBilling prop is deprecated')
    )
    warnSpy.mockRestore()
  })

  it('logs console.warn with message containing "loadBilling prop is deprecated" when loadBilling={false} is passed', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {})
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    }) as unknown as MockFetch

    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <FlowgladContextProvider
          loadBilling={false}
          requestConfig={{ fetch: mockFetch }}
        >
          <div>Child</div>
        </FlowgladContextProvider>
      </QueryClientProvider>
    )

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('loadBilling prop is deprecated')
    )
    warnSpy.mockRestore()
  })

  it('does not log deprecation warning when loadBilling prop is not provided', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {})
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    }) as unknown as MockFetch

    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <FlowgladContextProvider requestConfig={{ fetch: mockFetch }}>
          <div>Child</div>
        </FlowgladContextProvider>
      </QueryClientProvider>
    )

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('loadBilling')
    )
    warnSpy.mockRestore()
  })
})

describe('useCatalog removal', () => {
  it('is not present in @flowglad/react package exports (verified via import check)', () => {
    // Verify useCatalog is not exported from the index module
    const exports = FlowgladReact as Record<string, unknown>
    expect(exports.useCatalog).toBeUndefined()
    expect(Object.keys(exports)).not.toContain('useCatalog')
  })
})

describe('LoadedFlowgladProviderProps deprecated alias', () => {
  it('LoadedFlowgladProviderProps type is assignable to FlowgladProviderProps (type compatibility)', () => {
    const props: FlowgladProviderProps = { children: <div /> }
    const legacyProps: LoadedFlowgladProviderProps = props
    expect(legacyProps).toBe(props)
  })
})
