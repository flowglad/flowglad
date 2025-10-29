import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CheckoutFlowType, CurrencyCode, IntervalUnit, PriceType } from '@/types'
import { BillingHeader, intervalLabel, pricingSubtitleForSubscriptionFlow } from './billing-header'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import type { CheckoutPageContextValues } from '@/contexts/checkoutPageContext'

// Mock the checkout page context
vi.mock('@/contexts/checkoutPageContext', () => ({
  useCheckoutPageContext: vi.fn(),
}))

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => (
    <img src={src} alt={alt} {...props} />
  ),
}))

// Mock the CheckoutMarkdownView component
vi.mock('@/components/ui/checkout-markdown-view', () => ({
  CheckoutMarkdownView: ({ source, ...props }: any) => (
    <div data-testid="product-description" {...props}>
      {source}
    </div>
  ),
}))

// Mock the stripe utility function
vi.mock('@/utils/stripe', () => ({
  stripeCurrencyAmountToHumanReadableCurrencyAmount: vi.fn((currency, amount) => {
    return `$${(amount / 100).toFixed(2)}`
  }),
}))

const mockUseCheckoutPageContext = vi.mocked(useCheckoutPageContext)

describe('BillingHeader', () => {
  const mockCheckoutContext: Partial<CheckoutPageContextValues> = {
    flowType: CheckoutFlowType.Subscription,
    product: {
      id: 'prod_123',
      name: 'Test Product',
      description: 'Test product description',
      imageURL: 'https://example.com/image.jpg',
    } as any,
    price: {
      id: 'price_123',
      currency: CurrencyCode.USD,
      unitPrice: 2999, // $29.99
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    } as any,
    checkoutSession: {
      id: 'cs_123',
      quantity: 1,
    } as any,
    purchase: null,
    features: [
      { id: 'feat_1', name: 'Feature 1' } as any,
      { id: 'feat_2', name: 'Feature 2' } as any,
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCheckoutPageContext.mockReturnValue(mockCheckoutContext as any)
  })

  describe('intervalLabel function', () => {
    it('should return "monthly" for single month interval', () => {
      const result = intervalLabel(
        { intervalCount: 1, intervalUnit: IntervalUnit.Month },
        undefined
      )
      expect(result).toBe('monthly')
    })

    it('should return "yearly" for single year interval', () => {
      const result = intervalLabel(
        { intervalCount: 1, intervalUnit: IntervalUnit.Year },
        undefined
      )
      expect(result).toBe('yearly')
    })

    it('should return "weekly" for single week interval', () => {
      const result = intervalLabel(
        { intervalCount: 1, intervalUnit: IntervalUnit.Week },
        undefined
      )
      expect(result).toBe('weekly')
    })

    it('should return "daily" for single day interval', () => {
      const result = intervalLabel(
        { intervalCount: 1, intervalUnit: IntervalUnit.Day },
        undefined
      )
      expect(result).toBe('daily')
    })

    it('should return "2 months" for multiple month interval', () => {
      const result = intervalLabel(
        { intervalCount: 2, intervalUnit: IntervalUnit.Month },
        undefined
      )
      expect(result).toBe('2 months')
    })

    it('should return "3 years" for multiple year interval', () => {
      const result = intervalLabel(
        { intervalCount: 3, intervalUnit: IntervalUnit.Year },
        undefined
      )
      expect(result).toBe('3 years')
    })

    it('should return "6 weeks" for multiple week interval', () => {
      const result = intervalLabel(
        { intervalCount: 6, intervalUnit: IntervalUnit.Week },
        undefined
      )
      expect(result).toBe('6 weeks')
    })

    it('should return "7 days" for multiple day interval', () => {
      const result = intervalLabel(
        { intervalCount: 7, intervalUnit: IntervalUnit.Day },
        undefined
      )
      expect(result).toBe('7 days')
    })

    it('should fallback to price data when purchase data is null', () => {
      const result = intervalLabel(null, {
        intervalCount: 1,
        intervalUnit: IntervalUnit.Day,
      })
      expect(result).toBe('daily')
    })

    it('should fallback to price data when purchase data is undefined', () => {
      const result = intervalLabel(undefined, {
        intervalCount: 1,
        intervalUnit: IntervalUnit.Year,
      })
      expect(result).toBe('yearly')
    })

    it('should use purchase data when both purchase and price data exist', () => {
      const result = intervalLabel(
        { intervalCount: 2, intervalUnit: IntervalUnit.Month },
        { intervalCount: 1, intervalUnit: IntervalUnit.Year }
      )
      expect(result).toBe('2 months')
    })

    it('should default to monthly when no data is provided', () => {
      const result = intervalLabel(null, undefined)
      expect(result).toBe('monthly')
    })

    it('should handle zero interval count gracefully', () => {
      const result = intervalLabel(
        { intervalCount: 0, intervalUnit: IntervalUnit.Month },
        undefined
      )
      // Note: The current implementation returns "monthly" when intervalCount is 0 (since 0 is not > 1)
      expect(result).toBe('monthly')
    })
  })

})
