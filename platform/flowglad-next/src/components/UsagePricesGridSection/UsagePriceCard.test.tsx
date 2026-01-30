import { describe, expect, it } from 'bun:test'
import { CurrencyCode, IntervalUnit, PriceType } from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import { render, screen } from '@testing-library/react'
import { UsagePriceCard } from './UsagePriceCard'

/**
 * Creates a minimal Price.ClientUsageRecord for testing.
 * Overrides allow customizing specific fields for different test scenarios.
 * Uses the specific usage type for proper TypeScript validation.
 */
const createTestPrice = (
  overrides: Partial<Price.ClientUsageRecord> = {}
): Price.ClientUsageRecord => {
  const basePrice: Price.ClientUsageRecord = {
    id: 'price_test',
    name: 'Test Price',
    slug: 'test-price',
    type: PriceType.Usage,
    unitPrice: 100,
    currency: CurrencyCode.USD,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    usageEventsPerUnit: 1,
    usageMeterId: 'meter_test',
    productId: null,
    pricingModelId: 'pm_test',
    isDefault: false,
    active: true,
    trialPeriodDays: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    livemode: false,
  }
  return {
    ...basePrice,
    ...overrides,
  }
}

describe('UsagePriceCard', () => {
  describe('Status display', () => {
    it('displays "Default Price" when isDefault is true and active is true', () => {
      const price = createTestPrice({
        isDefault: true,
        active: true,
      })

      render(<UsagePriceCard price={price} />)

      expect(screen.getByText('Default Price')).toBeInTheDocument()
    })

    it('displays "Default Price" when isDefault is true and active is false (isDefault takes priority)', () => {
      // This test documents intentional behavior: isDefault takes priority over active.
      // A price could theoretically be both default and inactive during a transition.
      const price = createTestPrice({
        isDefault: true,
        active: false,
      })

      render(<UsagePriceCard price={price} />)

      expect(screen.getByText('Default Price')).toBeInTheDocument()
      expect(screen.queryByText('Inactive')).not.toBeInTheDocument()
    })

    it('displays "Active" when isDefault is false and active is true', () => {
      const price = createTestPrice({
        isDefault: false,
        active: true,
      })

      render(<UsagePriceCard price={price} />)

      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('displays "Inactive" when isDefault is false and active is false', () => {
      const price = createTestPrice({
        isDefault: false,
        active: false,
      })

      render(<UsagePriceCard price={price} />)

      expect(screen.getByText('Inactive')).toBeInTheDocument()
    })
  })

  describe('Price rate display', () => {
    it('displays singular "event" when usageEventsPerUnit is 1', () => {
      const price = createTestPrice({
        usageEventsPerUnit: 1,
      })

      render(<UsagePriceCard price={price} />)

      expect(screen.getByText('event')).toBeInTheDocument()
    })

    it('displays plural "events" when usageEventsPerUnit is greater than 1', () => {
      const price = createTestPrice({
        usageEventsPerUnit: 100,
      })

      render(<UsagePriceCard price={price} />)

      expect(screen.getByText('100 events')).toBeInTheDocument()
    })
  })

  describe('Slug display', () => {
    it('displays the price slug when available', () => {
      const price = createTestPrice({
        slug: 'my-custom-slug',
      })

      render(<UsagePriceCard price={price} />)

      expect(screen.getByText('my-custom-slug')).toBeInTheDocument()
    })

    it('falls back to displaying price id when slug is empty', () => {
      const price = createTestPrice({
        id: 'price_fallback_id',
        slug: '',
      })

      render(<UsagePriceCard price={price} />)

      expect(
        screen.getByText('price_fallback_id')
      ).toBeInTheDocument()
    })
  })
})
