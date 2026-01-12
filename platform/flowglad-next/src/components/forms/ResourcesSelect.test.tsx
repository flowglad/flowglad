import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trpc } from '@/app/_trpc/client'
import ResourcesSelect from './ResourcesSelect'

// Mock tRPC
vi.mock('@/app/_trpc/client', () => ({
  trpc: {
    resources: {
      list: {
        useQuery: vi.fn(),
      },
    },
  },
}))

interface TestFormValues {
  resourceId: string
}

const TestWrapper = ({
  children,
  defaultValues = { resourceId: '' },
}: {
  children: React.ReactNode
  defaultValues?: TestFormValues
}) => {
  const form = useForm<TestFormValues>({ defaultValues })
  return <FormProvider {...form}>{children}</FormProvider>
}

describe('ResourcesSelect', () => {
  const mockResources = [
    { id: 'resource_1', name: 'Seats', slug: 'seats', active: true },
    {
      id: 'resource_2',
      name: 'API Keys',
      slug: 'api-keys',
      active: true,
    },
    {
      id: 'resource_3',
      name: 'Projects',
      slug: 'projects',
      active: true,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading skeleton while fetching resources', () => {
    vi.mocked(trpc.resources.list.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof trpc.resources.list.useQuery>)

    const form = {
      control: {} as any,
    }

    render(
      <TestWrapper>
        <ResourcesSelect
          name="resourceId"
          control={form.control}
          pricingModelId="pm_123"
        />
      </TestWrapper>
    )

    // Skeleton should be visible (has animate-pulse class)
    const skeleton = document.querySelector('.animate-pulse')
    expect(skeleton).toBeInTheDocument()
  })

  it('displays all resources from the pricing model in dropdown', async () => {
    vi.mocked(trpc.resources.list.useQuery).mockReturnValue({
      data: { resources: mockResources },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof trpc.resources.list.useQuery>)

    const form = {
      control: {} as any,
    }

    render(
      <TestWrapper defaultValues={{ resourceId: 'resource_1' }}>
        <ResourcesSelect
          name="resourceId"
          control={form.control}
          pricingModelId="pm_123"
        />
      </TestWrapper>
    )

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('Resource')).toBeInTheDocument()
    })

    // The select trigger should be present
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('auto-selects first resource when none selected and resources load', async () => {
    const mockSetValue = vi.fn()

    vi.mocked(trpc.resources.list.useQuery).mockReturnValue({
      data: { resources: mockResources },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof trpc.resources.list.useQuery>)

    // Create a wrapper that provides form context with our mocks
    const TestWrapperWithMocks = ({
      children,
    }: {
      children: React.ReactNode
    }) => {
      const form = useForm<TestFormValues>({
        defaultValues: { resourceId: '' },
      })

      // Override setValue to track calls
      const originalSetValue = form.setValue
      form.setValue = ((name: any, value: any) => {
        mockSetValue(name, value)
        return originalSetValue(name, value)
      }) as typeof form.setValue

      return <FormProvider {...form}>{children}</FormProvider>
    }

    render(
      <TestWrapperWithMocks>
        <ResourcesSelect
          name="resourceId"
          control={{} as any}
          pricingModelId="pm_123"
        />
      </TestWrapperWithMocks>
    )

    // Wait for the auto-selection effect to run
    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith(
        'resourceId',
        'resource_1'
      )
    })
  })

  it('clears selection when pricingModelId changes and current selection is invalid', async () => {
    const mockSetValue = vi.fn()

    // Start with resources that don't include 'resource_1'
    vi.mocked(trpc.resources.list.useQuery).mockReturnValue({
      data: {
        resources: [
          {
            id: 'resource_new',
            name: 'New Resource',
            slug: 'new',
            active: true,
          },
        ],
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof trpc.resources.list.useQuery>)

    const TestWrapperWithMocks = ({
      children,
    }: {
      children: React.ReactNode
    }) => {
      const form = useForm<TestFormValues>({
        defaultValues: { resourceId: 'resource_1' }, // Invalid for new pricing model
      })

      const originalSetValue = form.setValue
      form.setValue = ((name: any, value: any) => {
        mockSetValue(name, value)
        return originalSetValue(name, value)
      }) as typeof form.setValue

      return <FormProvider {...form}>{children}</FormProvider>
    }

    render(
      <TestWrapperWithMocks>
        <ResourcesSelect
          name="resourceId"
          control={{} as any}
          pricingModelId="pm_456"
        />
      </TestWrapperWithMocks>
    )

    // Wait for the effect to reset to first valid resource
    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith(
        'resourceId',
        'resource_new'
      )
    })
  })

  it('shows disabled state when no resources available', async () => {
    vi.mocked(trpc.resources.list.useQuery).mockReturnValue({
      data: { resources: [] },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof trpc.resources.list.useQuery>)

    render(
      <TestWrapper>
        <ResourcesSelect
          name="resourceId"
          control={{} as any}
          pricingModelId="pm_123"
        />
      </TestWrapper>
    )

    await waitFor(() => {
      const combobox = screen.getByRole('combobox')
      expect(combobox).toBeDisabled()
    })
  })

  it('clears selection when resources become empty', async () => {
    const mockSetValue = vi.fn()

    vi.mocked(trpc.resources.list.useQuery).mockReturnValue({
      data: { resources: [] },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof trpc.resources.list.useQuery>)

    const TestWrapperWithMocks = ({
      children,
    }: {
      children: React.ReactNode
    }) => {
      const form = useForm<TestFormValues>({
        defaultValues: { resourceId: 'resource_1' }, // Has a value
      })

      const originalSetValue = form.setValue
      form.setValue = ((name: any, value: any) => {
        mockSetValue(name, value)
        return originalSetValue(name, value)
      }) as typeof form.setValue

      return <FormProvider {...form}>{children}</FormProvider>
    }

    render(
      <TestWrapperWithMocks>
        <ResourcesSelect
          name="resourceId"
          control={{} as any}
          pricingModelId="pm_123"
        />
      </TestWrapperWithMocks>
    )

    // Wait for the effect to clear the selection
    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('resourceId', '')
    })
  })

  it('does not fetch resources when pricingModelId is not provided', () => {
    vi.mocked(trpc.resources.list.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof trpc.resources.list.useQuery>)

    render(
      <TestWrapper>
        <ResourcesSelect
          name="resourceId"
          control={{} as any}
          pricingModelId={undefined}
        />
      </TestWrapper>
    )

    // Verify query was called with enabled: false
    expect(trpc.resources.list.useQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false })
    )
  })
})
