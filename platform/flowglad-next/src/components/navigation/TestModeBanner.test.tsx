/// <reference lib="dom" />

import { describe, expect, it } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { TestModeBanner } from './TestModeBanner'

describe('TestModeBanner', () => {
  describe('Rendering', () => {
    it('renders the test mode banner with default message when pricingModelName is not provided', () => {
      render(<TestModeBanner />)

      const banner = screen.getByTestId('test-mode-banner')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveTextContent(
        "You're in a test pricing model"
      )
      // Should not have the PM name in parentheses
      expect(banner.textContent).not.toContain('(')
    })

    it('renders the banner with pricing model name when provided', () => {
      render(<TestModeBanner pricingModelName="My Test PM" />)

      const banner = screen.getByTestId('test-mode-banner')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveTextContent(
        "You're in a test pricing model"
      )
      expect(banner).toHaveTextContent('(My Test PM)')
    })

    it('applies custom className when provided', () => {
      render(<TestModeBanner className="custom-class" />)

      const banner = screen.getByTestId('test-mode-banner')
      expect(banner.className).toContain('custom-class')
    })
  })

  describe('Accessibility', () => {
    it('has role="status" for screen reader announcement', () => {
      render(<TestModeBanner />)

      const banner = screen.getByRole('status')
      expect(banner).toBeInTheDocument()
    })

    it('has aria-live="polite" for non-intrusive updates', () => {
      render(<TestModeBanner />)

      const banner = screen.getByTestId('test-mode-banner')
      expect(banner).toHaveAttribute('aria-live', 'polite')
    })
  })

  describe('Styling', () => {
    it('has sticky positioning at top of viewport', () => {
      render(<TestModeBanner />)

      const banner = screen.getByTestId('test-mode-banner')
      expect(banner.className).toContain('sticky')
      expect(banner.className).toContain('top-0')
    })

    it('has amber background color for test mode indication', () => {
      render(<TestModeBanner />)

      const banner = screen.getByTestId('test-mode-banner')
      expect(banner.className).toContain('bg-amber-200')
    })

    it('has high z-index for proper stacking', () => {
      render(<TestModeBanner />)

      const banner = screen.getByTestId('test-mode-banner')
      expect(banner.className).toContain('z-50')
    })
  })
})
