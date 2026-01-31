/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from 'bun:test'

// Create mock functions
const mockInvalidate = mock(() => Promise.resolve())
const mockRefetch = mock(() => Promise.resolve())
const mockMutateAsync = mock(() => Promise.resolve())
const mockRouterPush = mock()

// Track mutation calls
let mutationOnSuccess: (() => Promise<void>) | undefined

// Mock data
const mockPricingModels = [
  {
    pricingModel: {
      id: 'pm-test-1',
      name: 'Beta Test',
      livemode: false,
    },
  },
  {
    pricingModel: {
      id: 'pm-live-2',
      name: 'Alpha Production',
      livemode: true,
    },
  },
  {
    pricingModel: {
      id: 'pm-live-1',
      name: 'Zebra Production',
      livemode: true,
    },
  },
  {
    pricingModel: {
      id: 'pm-test-2',
      name: 'Alpha Test',
      livemode: false,
    },
  },
]

const mockFocusedMembership = {
  organization: { id: 'org-1', name: 'Test Org' },
  pricingModel: {
    id: 'pm-live-1',
    name: 'Zebra Production',
    livemode: true,
  },
  membership: { livemode: true },
}

mock.module('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    refresh: mock(),
  }),
}))

mock.module('@/hooks/useContextAwareNavigation', () => ({
  useContextAwareNavigation: () => ({
    navigateToPath: mock(),
  }),
}))

mock.module('@/app/_trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      invalidate: mockInvalidate,
    }),
    organizations: {
      getFocusedMembership: {
        useQuery: () => ({
          data: mockFocusedMembership,
          isPending: false,
          isLoading: false,
          refetch: mockRefetch,
        }),
      },
      updateFocusedPricingModel: {
        useMutation: ({
          onSuccess,
        }: {
          onSuccess?: () => Promise<void>
        }) => {
          mutationOnSuccess = onSuccess
          return {
            mutateAsync: mockMutateAsync,
            isPending: false,
          }
        },
      },
    },
    pricingModels: {
      getAllForSwitcher: {
        useQuery: () => ({
          data: { items: mockPricingModels },
          isLoading: false,
        }),
      },
    },
  },
}))

// Import after mocks
import { act, renderHook } from '@testing-library/react'
import { usePricingModelList } from './usePricingModelList'

describe('usePricingModelList', () => {
  beforeEach(() => {
    mockInvalidate.mockClear()
    mockRefetch.mockClear()
    mockMutateAsync.mockClear()
    mockRouterPush.mockClear()
    mutationOnSuccess = undefined

    // Reset window.location.pathname
    Object.defineProperty(window, 'location', {
      value: { pathname: '/dashboard' },
      writable: true,
    })
  })

  describe('Sorting logic', () => {
    it('sorts pricing models with livemode PMs first', () => {
      const { result } = renderHook(() => usePricingModelList())

      const sortedPMs = result.current.pricingModels

      // First two should be livemode (true)
      expect(sortedPMs[0].pricingModel.livemode).toBe(true)
      expect(sortedPMs[1].pricingModel.livemode).toBe(true)

      // Last two should be test mode (false)
      expect(sortedPMs[2].pricingModel.livemode).toBe(false)
      expect(sortedPMs[3].pricingModel.livemode).toBe(false)
    })

    it('sorts by name alphabetically within each livemode group', () => {
      const { result } = renderHook(() => usePricingModelList())

      const sortedPMs = result.current.pricingModels

      // Live mode PMs should be sorted by name: Alpha < Zebra
      expect(sortedPMs[0].pricingModel.name).toBe('Alpha Production')
      expect(sortedPMs[1].pricingModel.name).toBe('Zebra Production')

      // Test mode PMs should be sorted by name: Alpha < Beta
      expect(sortedPMs[2].pricingModel.name).toBe('Alpha Test')
      expect(sortedPMs[3].pricingModel.name).toBe('Beta Test')
    })
  })

  describe('Current pricing model tracking', () => {
    it('returns the current pricing model ID from focused membership', () => {
      const { result } = renderHook(() => usePricingModelList())

      expect(result.current.currentPricingModelId).toBe('pm-live-1')
    })

    it('returns the current pricing model object from focused membership', () => {
      const { result } = renderHook(() => usePricingModelList())

      expect(result.current.currentPricingModel).toEqual({
        id: 'pm-live-1',
        name: 'Zebra Production',
        livemode: true,
      })
    })
  })

  describe('switchPricingModel behavior', () => {
    it('calls mutateAsync with the new pricingModelId when switching', async () => {
      const { result } = renderHook(() => usePricingModelList())

      await act(async () => {
        await result.current.switchPricingModel('pm-test-1')
      })

      expect(mockMutateAsync).toHaveBeenCalledWith({
        pricingModelId: 'pm-test-1',
      })
    })

    it('does not call mutateAsync when switching to the same PM', async () => {
      const { result } = renderHook(() => usePricingModelList())

      await act(async () => {
        await result.current.switchPricingModel('pm-live-1')
      })

      expect(mockMutateAsync).not.toHaveBeenCalled()
    })

    it('navigates to new PM detail page when on a PM detail page', async () => {
      // Set the pathname to a PM detail page
      Object.defineProperty(window, 'location', {
        value: { pathname: '/pricing-models/pm-live-1' },
        writable: true,
      })

      const { result } = renderHook(() => usePricingModelList())

      await act(async () => {
        await result.current.switchPricingModel('pm-test-1')
      })

      expect(mockRouterPush).toHaveBeenCalledWith(
        '/pricing-models/pm-test-1'
      )
    })

    it('does not navigate when not on a PM detail page', async () => {
      // Set the pathname to dashboard (not a PM detail page)
      Object.defineProperty(window, 'location', {
        value: { pathname: '/dashboard' },
        writable: true,
      })

      const { result } = renderHook(() => usePricingModelList())

      await act(async () => {
        await result.current.switchPricingModel('pm-test-1')
      })

      expect(mockRouterPush).not.toHaveBeenCalled()
    })
  })

  describe('Loading and switching states', () => {
    it('returns isLoading=false when data is loaded', () => {
      const { result } = renderHook(() => usePricingModelList())

      expect(result.current.isLoading).toBe(false)
    })

    it('returns isSwitching from the mutation state', () => {
      const { result } = renderHook(() => usePricingModelList())

      // Initially not switching
      expect(result.current.isSwitching).toBe(false)
    })
  })
})
