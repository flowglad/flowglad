import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'

// Create mock function that we can control
const mockUseQuery = mock()

// Mock tRPC
mock.module('@/app/_trpc/client', () => ({
  trpc: {
    resourceClaims: {
      listResourceUsages: {
        useQuery: () => mockUseQuery(),
      },
    },
  },
}))

// Import component AFTER mock.module calls (bun:test doesn't hoist mocks)
import { SubscriptionResourceUsage } from './SubscriptionResourceUsage'

describe('SubscriptionResourceUsage', () => {
  beforeEach(() => {
    mockUseQuery.mockClear()
  })

  describe('resource usage display', () => {
    it('displays ratio format for capacity less than 100 and uses ChartPie icon', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'seats',
              resourceId: 'res_123',
              capacity: 10,
              claimed: 3,
              available: 7,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      // Shows "seats" resource
      expect(screen.getByText('seats')).toBeInTheDocument()
      // Shows ratio format for capacity < 100
      expect(screen.getByText('3 of 10 claimed')).toBeInTheDocument()
      // Does NOT show "available" text on the card (only in modal)
      expect(
        screen.queryByText('7 available')
      ).not.toBeInTheDocument()
      // Progress bar at 30%
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '30')
      // ChartPie icon is rendered
      const svgIcon = document.querySelector('svg.lucide-chart-pie')
      expect(svgIcon).toBeInTheDocument()
    })

    it('displays percentage format for capacity 100 or greater', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'api-calls',
              resourceId: 'res_123',
              capacity: 1000,
              claimed: 750,
              available: 250,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      // Shows percentage format for capacity >= 100
      expect(screen.getByText('75% used')).toBeInTheDocument()
      // Does NOT show ratio format
      expect(
        screen.queryByText('750 of 1000 claimed')
      ).not.toBeInTheDocument()
      // Does NOT show "available" text on the card
      expect(
        screen.queryByText('250 available')
      ).not.toBeInTheDocument()
    })

    it('displays multiple resources with appropriate format based on capacity', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'seats',
              resourceId: 'res_123',
              capacity: 10,
              claimed: 3,
              available: 7,
            },
            claims: [],
          },
          {
            usage: {
              resourceSlug: 'api-keys',
              resourceId: 'res_456',
              capacity: 5,
              claimed: 2,
              available: 3,
            },
            claims: [],
          },
          {
            usage: {
              resourceSlug: 'api-calls',
              resourceId: 'res_789',
              capacity: 100,
              claimed: 50,
              available: 50,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      // Each resource has its own usage display
      expect(screen.getByText('seats')).toBeInTheDocument()
      expect(screen.getByText('api-keys')).toBeInTheDocument()
      expect(screen.getByText('api-calls')).toBeInTheDocument()
      // Ratio format for capacity < 100
      expect(screen.getByText('3 of 10 claimed')).toBeInTheDocument()
      expect(screen.getByText('2 of 5 claimed')).toBeInTheDocument()
      // Percentage format for capacity >= 100
      expect(screen.getByText('50% used')).toBeInTheDocument()
    })
  })

  describe('layout', () => {
    it('renders resource cards in a responsive 2-column grid layout', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'seats',
              resourceId: 'res_123',
              capacity: 10,
              claimed: 3,
              available: 7,
            },
            claims: [],
          },
          {
            usage: {
              resourceSlug: 'api-keys',
              resourceId: 'res_456',
              capacity: 5,
              claimed: 2,
              available: 3,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      const { container } = render(
        <SubscriptionResourceUsage subscriptionId="sub_123" />
      )

      // Container has grid layout classes
      const gridContainer = container.querySelector('.grid')
      expect(gridContainer).toBeInTheDocument()
      expect(gridContainer).toHaveClass('grid-cols-1')
      expect(gridContainer).toHaveClass('sm:grid-cols-2')
      expect(gridContainer).toHaveClass('gap-2')
    })

    it('applies custom className to the grid container', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'seats',
              resourceId: 'res_123',
              capacity: 10,
              claimed: 3,
              available: 7,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      const { container } = render(
        <SubscriptionResourceUsage
          subscriptionId="sub_123"
          className="custom-class"
        />
      )

      // Custom class is applied to the grid container
      const gridContainer = container.querySelector('.grid')
      expect(gridContainer).toHaveClass('custom-class')
    })
  })

  describe('modal interaction', () => {
    it('opens detail modal when resource card is clicked and displays available count', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'seats',
              resourceId: 'res_123',
              capacity: 100,
              claimed: 75,
              available: 25,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      // Click on the resource card (it's now a button)
      const resourceCard = screen.getByRole('button', {
        name: /seats/i,
      })
      fireEvent.click(resourceCard)

      // Modal should be visible with the resource data
      const modalTitle = await screen.findByRole('dialog')
      expect(modalTitle).toBeInTheDocument()

      // Modal displays capacity stats including "Available" which is only shown here
      expect(screen.getByText('100')).toBeInTheDocument() // Total Capacity
      expect(screen.getByText('75')).toBeInTheDocument() // Claimed (in modal)
      expect(screen.getByText('25')).toBeInTheDocument() // Available (in modal)
      expect(screen.getByText('Total Capacity')).toBeInTheDocument()
      expect(screen.getByText('Claimed')).toBeInTheDocument()
      expect(screen.getByText('Available')).toBeInTheDocument()
    })
  })

  describe('loading and error states', () => {
    it('shows loading skeleton in 2-column grid while fetching usage data', async () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      })

      const { container } = render(
        <SubscriptionResourceUsage subscriptionId="sub_123" />
      )

      // Shows skeleton loading indicators in grid layout
      const gridContainer = container.querySelector('.grid')
      expect(gridContainer).toBeInTheDocument()
      expect(gridContainer).toHaveClass('grid-cols-1')
      expect(gridContainer).toHaveClass('sm:grid-cols-2')

      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('shows error message when fetch fails', async () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Failed to fetch' },
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      expect(
        screen.getByText('Failed to load resource usage.')
      ).toBeInTheDocument()
    })

    it('shows empty state when subscription has no resource features', async () => {
      mockUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      expect(
        screen.getByText('No resource usage')
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          /This subscription doesn't have any resources configured/
        )
      ).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles zero capacity without division by zero', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'seats',
              resourceId: 'res_123',
              capacity: 0,
              claimed: 0,
              available: 0,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      expect(screen.getByText('seats')).toBeInTheDocument()
      // Shows ratio format for zero capacity (capacity < 100)
      expect(screen.getByText('0 of 0 claimed')).toBeInTheDocument()
    })

    it('displays ratio for fully utilized resource with small capacity', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'seats',
              resourceId: 'res_123',
              capacity: 5,
              claimed: 5,
              available: 0,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      // Shows ratio format since capacity < 100
      expect(screen.getByText('5 of 5 claimed')).toBeInTheDocument()
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '100')
    })

    it('caps progress bar at 100% when resource is over-claimed', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'seats',
              resourceId: 'res_123',
              capacity: 5,
              claimed: 7,
              available: -2,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      // Displays actual claimed/capacity values in ratio format
      expect(screen.getByText('seats')).toBeInTheDocument()
      expect(screen.getByText('7 of 5 claimed')).toBeInTheDocument()
      // Progress bar is capped at 100%
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '100')
    })

    it('displays percentage at exactly capacity=100 boundary', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'api-calls',
              resourceId: 'res_123',
              capacity: 100,
              claimed: 30,
              available: 70,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      // At exactly 100, should show percentage
      expect(screen.getByText('30% used')).toBeInTheDocument()
      expect(
        screen.queryByText('30 of 100 claimed')
      ).not.toBeInTheDocument()
    })

    it('displays ratio at capacity=99 boundary', async () => {
      mockUseQuery.mockReturnValue({
        data: [
          {
            usage: {
              resourceSlug: 'seats',
              resourceId: 'res_123',
              capacity: 99,
              claimed: 30,
              available: 69,
            },
            claims: [],
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<SubscriptionResourceUsage subscriptionId="sub_123" />)

      // At 99, should show ratio
      expect(screen.getByText('30 of 99 claimed')).toBeInTheDocument()
      expect(screen.queryByText(/% used/)).not.toBeInTheDocument()
    })
  })
})
