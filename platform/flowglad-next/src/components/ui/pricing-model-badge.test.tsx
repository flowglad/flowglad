/// <reference lib="dom" />

import { describe, expect, it } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { PricingModelBadge } from './pricing-model-badge'

describe('PricingModelBadge', () => {
  describe('Live mode badge', () => {
    it('renders "Live" badge with green styling when livemode is true', () => {
      render(<PricingModelBadge livemode={true} />)

      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent('Live')
      expect(badge).toHaveAttribute('aria-label', 'Live')
      expect(badge.className).toContain('bg-jade-background')
      expect(badge.className).toContain('text-jade-foreground')
      expect(badge.className).toContain('border-jade-border')
    })

    it('renders Zap icon for live mode badge', () => {
      const { container } = render(
        <PricingModelBadge livemode={true} />
      )

      // Zap icon is rendered (lucide-react icons render as SVG)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('ignores isDefault prop when livemode is true', () => {
      render(<PricingModelBadge livemode={true} isDefault={true} />)

      const badge = screen.getByRole('status')
      // Should still show "Live", not "Test - Default"
      expect(badge).toHaveTextContent('Live')
      expect(badge).not.toHaveTextContent('Default')
    })
  })

  describe('Test mode badge (non-default)', () => {
    it('renders "Test" badge with amber styling when livemode is false and isDefault is false', () => {
      render(<PricingModelBadge livemode={false} isDefault={false} />)

      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent('Test')
      expect(badge).not.toHaveTextContent('Default')
      expect(badge).toHaveAttribute('aria-label', 'Test')
      expect(badge.className).toContain('bg-citrine-background')
      expect(badge.className).toContain('text-citrine-foreground')
      expect(badge.className).toContain('border-citrine-border')
    })

    it('renders FlaskConical icon for test mode non-default badge', () => {
      const { container } = render(
        <PricingModelBadge livemode={false} isDefault={false} />
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('defaults isDefault to false when not provided', () => {
      render(<PricingModelBadge livemode={false} />)

      const badge = screen.getByRole('status')
      expect(badge).toHaveTextContent('Test')
      expect(badge).not.toHaveTextContent('Default')
      expect(badge).toHaveAttribute('aria-label', 'Test')
    })
  })

  describe('Test mode badge (default)', () => {
    it('renders "Test - Default" badge with amber styling when livemode is false and isDefault is true', () => {
      render(<PricingModelBadge livemode={false} isDefault={true} />)

      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent('Test - Default')
      expect(badge).toHaveAttribute('aria-label', 'Test - Default')
      expect(badge.className).toContain('bg-citrine-background')
      expect(badge.className).toContain('text-citrine-foreground')
      expect(badge.className).toContain('border-citrine-border')
    })

    it('renders Check icon for default test mode badge', () => {
      const { container } = render(
        <PricingModelBadge livemode={false} isDefault={true} />
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('Size variants', () => {
    it('applies small size styles when size="sm"', () => {
      render(<PricingModelBadge livemode={true} size="sm" />)

      const badge = screen.getByRole('status')
      expect(badge.className).toContain('px-2')
      expect(badge.className).toContain('py-0.5')
      expect(badge.className).toContain('text-xs')
      expect(badge.className).toContain('gap-1')
    })

    it('applies medium size styles when size="md"', () => {
      render(<PricingModelBadge livemode={true} size="md" />)

      const badge = screen.getByRole('status')
      expect(badge.className).toContain('px-2.5')
      expect(badge.className).toContain('py-0.5')
      expect(badge.className).toContain('text-xs')
      expect(badge.className).toContain('gap-1.5')
    })

    it('defaults to medium size when size prop is not provided', () => {
      render(<PricingModelBadge livemode={true} />)

      const badge = screen.getByRole('status')
      expect(badge.className).toContain('px-2.5')
      expect(badge.className).toContain('gap-1.5')
    })
  })

  describe('Custom className', () => {
    it('applies additional className when provided', () => {
      render(
        <PricingModelBadge livemode={true} className="custom-class" />
      )

      const badge = screen.getByRole('status')
      expect(badge.className).toContain('custom-class')
    })
  })

  describe('Accessibility', () => {
    it('has role="status" for all badge variants', () => {
      const { rerender } = render(
        <PricingModelBadge livemode={true} />
      )
      expect(screen.getByRole('status')).toBeInTheDocument()

      rerender(<PricingModelBadge livemode={false} />)
      expect(screen.getByRole('status')).toBeInTheDocument()

      rerender(
        <PricingModelBadge livemode={false} isDefault={true} />
      )
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('hides icon from screen readers with aria-hidden', () => {
      const { container } = render(
        <PricingModelBadge livemode={true} />
      )

      const iconWrapper = container.querySelector(
        '[aria-hidden="true"]'
      )
      expect(iconWrapper).toBeInTheDocument()
    })
  })
})
