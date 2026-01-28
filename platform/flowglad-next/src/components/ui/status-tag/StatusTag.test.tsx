import { describe, expect, it } from 'bun:test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createStatusTag } from './createStatusTag'
import { StatusTag } from './StatusTag'
import type { StatusConfigItem } from './types'

// Test icons as simple components
function CheckIcon({ className }: { className?: string }) {
  return (
    <span data-testid="check-icon" className={className}>
      ✓
    </span>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <span data-testid="x-icon" className={className}>
      ✗
    </span>
  )
}

// Test config with known values
const testConfig = {
  active: {
    label: 'Active',
    variant: 'success',
    icon: CheckIcon,
    tooltip: 'This is active',
  },
  pending: {
    label: 'Pending',
    variant: 'warning',
    tooltip: 'This is pending',
    // No icon defined
  },
  canceled: {
    label: 'Canceled',
    variant: 'muted',
    icon: XIcon,
    // No tooltip defined
  },
} satisfies Record<string, StatusConfigItem>

describe('StatusTag', () => {
  describe('rendering with valid config', () => {
    it('renders "Active" label with success variant classes when status is "active"', () => {
      render(<StatusTag status="active" config={testConfig} />)

      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('Active')
      expect(badge).toHaveClass('bg-jade-background')
      expect(badge).toHaveClass('text-jade-foreground')
      expect(badge).toHaveAttribute('aria-label', 'Active')
    })

    it('renders Check icon when status is "active" and config defines an icon', () => {
      render(<StatusTag status="active" config={testConfig} />)

      expect(screen.getByTestId('check-icon')).toBeInTheDocument()
    })

    it('renders without icon when status is "pending" and config has no icon defined', () => {
      render(<StatusTag status="pending" config={testConfig} />)

      expect(
        screen.queryByTestId('check-icon')
      ).not.toBeInTheDocument()
      expect(screen.queryByTestId('x-icon')).not.toBeInTheDocument()
    })

    it('hides icon when showIcon={false} even if config defines an icon', () => {
      render(
        <StatusTag
          status="active"
          config={testConfig}
          showIcon={false}
        />
      )

      expect(
        screen.queryByTestId('check-icon')
      ).not.toBeInTheDocument()
    })

    it('overrides label when label prop is provided', () => {
      render(
        <StatusTag
          status="active"
          config={testConfig}
          label="Custom Label"
        />
      )

      expect(screen.getByRole('status')).toHaveTextContent(
        'Custom Label'
      )
      expect(screen.getByRole('status')).not.toHaveTextContent(
        'Active'
      )
    })
  })

  describe('size variants', () => {
    it('applies px-2 and text-xs classes when size="sm"', () => {
      render(
        <StatusTag status="active" config={testConfig} size="sm" />
      )

      const badge = screen.getByRole('status')
      expect(badge).toHaveClass('px-2')
      expect(badge).toHaveClass('text-xs')
    })

    it('applies px-2.5 classes when size="md" (default)', () => {
      render(<StatusTag status="active" config={testConfig} />)

      const badge = screen.getByRole('status')
      expect(badge).toHaveClass('px-2.5')
    })
  })

  describe('tooltip behavior', () => {
    it('does not render tooltip content when showTooltip is false', () => {
      render(
        <TooltipProvider>
          <StatusTag
            status="active"
            config={testConfig}
            showTooltip={false}
          />
        </TooltipProvider>
      )

      expect(
        screen.queryByText('This is active')
      ).not.toBeInTheDocument()
    })

    it('renders tooltip content when showTooltip is true and user hovers', async () => {
      const user = userEvent.setup()
      render(
        <TooltipProvider delayDuration={0}>
          <StatusTag
            status="active"
            config={testConfig}
            showTooltip
          />
        </TooltipProvider>
      )

      const badge = screen.getByRole('status')
      await user.hover(badge)

      await waitFor(() => {
        // Radix UI renders tooltip text in multiple places (visible content + accessible hidden span)
        const tooltipElements = screen.getAllByText('This is active')
        expect(tooltipElements.length).toBeGreaterThan(0)
      })
    })

    it('does not render tooltip when showTooltip is true but config has no tooltip', async () => {
      const user = userEvent.setup()
      render(
        <TooltipProvider delayDuration={0}>
          <StatusTag
            status="canceled"
            config={testConfig}
            showTooltip
          />
        </TooltipProvider>
      )

      const badge = screen.getByRole('status')
      await user.hover(badge)

      // Badge should still render, but no tooltip content
      expect(badge).toHaveTextContent('Canceled')
      // Give some time for potential tooltip to render
      await new Promise((resolve) => setTimeout(resolve, 100))
      // Tooltip content should not appear since config has no tooltip
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    it('overrides tooltip text when tooltip prop is provided', async () => {
      const user = userEvent.setup()
      render(
        <TooltipProvider delayDuration={0}>
          <StatusTag
            status="active"
            config={testConfig}
            showTooltip
            tooltip="Custom tooltip"
          />
        </TooltipProvider>
      )

      const badge = screen.getByRole('status')
      await user.hover(badge)

      await waitFor(() => {
        // Radix UI renders tooltip text in multiple places (visible content + accessible hidden span)
        const tooltipElements = screen.getAllByText('Custom tooltip')
        expect(tooltipElements.length).toBeGreaterThan(0)
      })
      // Original tooltip text should not appear
      expect(screen.queryAllByText('This is active')).toHaveLength(0)
    })

    it('adds tabIndex={0} for keyboard accessibility when showTooltip is true', () => {
      render(
        <TooltipProvider>
          <StatusTag
            status="active"
            config={testConfig}
            showTooltip
          />
        </TooltipProvider>
      )

      expect(screen.getByRole('status')).toHaveAttribute(
        'tabIndex',
        '0'
      )
    })

    it('does not add tabIndex when showTooltip is false', () => {
      render(
        <StatusTag
          status="active"
          config={testConfig}
          showTooltip={false}
        />
      )

      expect(screen.getByRole('status')).not.toHaveAttribute(
        'tabIndex'
      )
    })
  })

  describe('unknown status handling', () => {
    it('renders fallback badge showing the invalid status value when config is missing', () => {
      // Note: core.error reports this to Sentry in production, console.error in dev
      // The error IS logged (visible in test output) but we focus on UI behavior

      render(
        // @ts-expect-error - Testing with unknown status value
        <StatusTag status="unknown_status" config={testConfig} />
      )

      // Should render the invalid status value in the badge for debugging
      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('unknown_status')
      expect(badge).toHaveAttribute(
        'aria-label',
        'Unknown status: unknown_status'
      )
    })

    it('renders "Unknown" when status value is empty string', () => {
      // @ts-expect-error - Testing with empty status value
      render(<StatusTag status="" config={testConfig} />)

      expect(screen.getByRole('status')).toHaveTextContent('Unknown')
    })
  })

  describe('accessibility', () => {
    it('renders with role="status" attribute', () => {
      render(<StatusTag status="active" config={testConfig} />)

      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('sets aria-hidden="true" on icon element', () => {
      const { container } = render(
        <StatusTag status="active" config={testConfig} />
      )

      const icon = container.querySelector(
        '[data-testid="check-icon"]'
      )?.parentElement
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })
  })
})

describe('createStatusTag', () => {
  it('creates component that renders status without requiring config prop', () => {
    const TestStatusTag = createStatusTag(testConfig)

    render(<TestStatusTag status="active" />)

    expect(screen.getByRole('status')).toHaveTextContent('Active')
  })
})
