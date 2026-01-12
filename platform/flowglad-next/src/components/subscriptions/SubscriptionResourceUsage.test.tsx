import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trpc } from '@/app/_trpc/client'
import { SubscriptionResourceUsage } from './SubscriptionResourceUsage'

// Mock tRPC
vi.mock('@/app/_trpc/client', () => ({
  trpc: {
    resourceClaims: {
      getUsage: {
        useQuery: vi.fn(),
      },
    },
  },
}))

describe('SubscriptionResourceUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays resource usage with correct capacity/claimed/available values', async () => {
    // setup: mock getUsage to return usage data
    vi.mocked(trpc.resourceClaims.getUsage.useQuery).mockReturnValue({
      data: {
        usage: [
          {
            resourceSlug: 'seats',
            resourceId: 'res_123',
            capacity: 10,
            claimed: 3,
            available: 7,
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof trpc.resourceClaims.getUsage.useQuery>)

    render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

    // expectation: shows "seats" resource
    expect(screen.getByText('seats')).toBeInTheDocument()
    // expectation: shows "3 / 10 claimed"
    expect(screen.getByText('3 / 10 claimed')).toBeInTheDocument()
    // expectation: shows "7 available"
    expect(screen.getByText('7 available')).toBeInTheDocument()
    // expectation: shows 30% used
    expect(screen.getByText('30% used')).toBeInTheDocument()
    // expectation: progress bar at 30% - check the progress element exists
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '30')
  })

  it('shows empty state when subscription has no resource features', async () => {
    // setup: mock getUsage returns empty usage array
    vi.mocked(trpc.resourceClaims.getUsage.useQuery).mockReturnValue({
      data: { usage: [] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof trpc.resourceClaims.getUsage.useQuery>)

    const { container } = render(
      <SubscriptionResourceUsage subscriptionId="sub_123" />
    )

    // expectation: returns null, so no content is rendered
    expect(container.firstChild).toBeNull()
  })

  it('shows loading state while fetching usage data', async () => {
    // setup: mock loading state
    vi.mocked(trpc.resourceClaims.getUsage.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof trpc.resourceClaims.getUsage.useQuery>)

    render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

    // expectation: shows skeleton loading indicators (2 skeletons by default)
    // The skeletons will have animate-pulse class
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('displays multiple resources when subscription has multiple resource features', async () => {
    // setup: mock getUsage with multiple resources
    vi.mocked(trpc.resourceClaims.getUsage.useQuery).mockReturnValue({
      data: {
        usage: [
          {
            resourceSlug: 'seats',
            resourceId: 'res_123',
            capacity: 10,
            claimed: 3,
            available: 7,
          },
          {
            resourceSlug: 'api-keys',
            resourceId: 'res_456',
            capacity: 5,
            claimed: 2,
            available: 3,
          },
          {
            resourceSlug: 'projects',
            resourceId: 'res_789',
            capacity: 100,
            claimed: 50,
            available: 50,
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof trpc.resourceClaims.getUsage.useQuery>)

    render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

    // expectation: each resource has its own usage display
    expect(screen.getByText('seats')).toBeInTheDocument()
    expect(screen.getByText('api-keys')).toBeInTheDocument()
    expect(screen.getByText('projects')).toBeInTheDocument()

    // Check all claimed/available stats are present
    expect(screen.getByText('3 / 10 claimed')).toBeInTheDocument()
    expect(screen.getByText('7 available')).toBeInTheDocument()
    expect(screen.getByText('2 / 5 claimed')).toBeInTheDocument()
    expect(screen.getByText('3 available')).toBeInTheDocument()
    expect(screen.getByText('50 / 100 claimed')).toBeInTheDocument()
    expect(screen.getByText('50 available')).toBeInTheDocument()
  })

  it('shows error message when fetch fails', async () => {
    // setup: mock error state
    vi.mocked(trpc.resourceClaims.getUsage.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Failed to fetch' },
    } as unknown as ReturnType<
      typeof trpc.resourceClaims.getUsage.useQuery
    >)

    render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

    // expectation: shows error message
    expect(
      screen.getByText('Failed to load resource usage.')
    ).toBeInTheDocument()
  })

  it('handles zero capacity gracefully', async () => {
    // setup: mock getUsage with zero capacity (edge case)
    vi.mocked(trpc.resourceClaims.getUsage.useQuery).mockReturnValue({
      data: {
        usage: [
          {
            resourceSlug: 'seats',
            resourceId: 'res_123',
            capacity: 0,
            claimed: 0,
            available: 0,
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof trpc.resourceClaims.getUsage.useQuery>)

    render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

    // expectation: handles zero capacity without division by zero
    expect(screen.getByText('seats')).toBeInTheDocument()
    expect(screen.getByText('0 / 0 claimed')).toBeInTheDocument()
    expect(screen.getByText('0 available')).toBeInTheDocument()
    expect(screen.getByText('0% used')).toBeInTheDocument()
  })

  it('handles fully utilized resource', async () => {
    // setup: mock getUsage with fully claimed resource
    vi.mocked(trpc.resourceClaims.getUsage.useQuery).mockReturnValue({
      data: {
        usage: [
          {
            resourceSlug: 'seats',
            resourceId: 'res_123',
            capacity: 5,
            claimed: 5,
            available: 0,
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof trpc.resourceClaims.getUsage.useQuery>)

    render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

    // expectation: shows 100% utilization
    expect(screen.getByText('5 / 5 claimed')).toBeInTheDocument()
    expect(screen.getByText('0 available')).toBeInTheDocument()
    expect(screen.getByText('100% used')).toBeInTheDocument()
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '100')
  })

  it('applies custom className', async () => {
    // setup: render with custom className
    vi.mocked(trpc.resourceClaims.getUsage.useQuery).mockReturnValue({
      data: {
        usage: [
          {
            resourceSlug: 'seats',
            resourceId: 'res_123',
            capacity: 10,
            claimed: 3,
            available: 7,
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof trpc.resourceClaims.getUsage.useQuery>)

    const { container } = render(
      <SubscriptionResourceUsage
        subscriptionId="sub_123"
        className="custom-class"
      />
    )

    // expectation: custom class is applied to the root element
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
