import { describe, it, vi } from 'vitest'
import { overagePriceLabelFromPrice } from './OveragePriceSelect'
import { usageDummyPrice } from '@/stubs/priceStubs'
import { Price } from '@/db/schema/prices'
import { CurrencyCode } from '@/types'
import { expect } from 'vitest'

describe('overagePriceLabelFromPrice', () => {
  const baseUsagePrice: Price.ClientUsageRecord = {
    ...usageDummyPrice,
    // these are not part of the base type, but are required for ClientUsageRecord
    usageMeterId: 'um_123',
    usageEventsPerUnit: 1,
    name: 'Standard',
  }
  it('should return a formatted label for a price with a name and usageEventsPerUnit of 1', () => {
    // setup:
    const price: Price.ClientUsageRecord = {
      ...baseUsagePrice,
      name: 'Standard',
      currency: CurrencyCode.USD,
      unitPrice: 500,
      usageEventsPerUnit: 1,
    }

    // expects:
    expect(overagePriceLabelFromPrice(price)).toBe(
      'Standard - $5.00 each'
    )
  })

  it('should return a formatted label for a price with a name and usageEventsPerUnit greater than 1', () => {
    // setup:
    const price: Price.ClientUsageRecord = {
      ...baseUsagePrice,
      name: 'Bulk',
      currency: CurrencyCode.USD,
      unitPrice: 5000,
      usageEventsPerUnit: 100,
    }
    // expects:
    expect(overagePriceLabelFromPrice(price)).toBe(
      'Bulk - $50.00 / 100'
    )
  })

  it('should use "Unnamed" for a price with a null name and usageEventsPerUnit of 1', () => {
    // setup:
    const price: Price.ClientUsageRecord = {
      ...baseUsagePrice,
      name: null,
      currency: CurrencyCode.EUR,
      unitPrice: 1000,
      usageEventsPerUnit: 1,
    }
    // expects:
    expect(overagePriceLabelFromPrice(price)).toBe(
      'Unnamed - €10.00 each'
    )
  })

  it('should use "Unnamed" for a price with a null name and usageEventsPerUnit greater than 1', () => {
    // setup:
    const price: Price.ClientUsageRecord = {
      ...baseUsagePrice,
      name: null,
      currency: CurrencyCode.GBP,
      unitPrice: 2500,
      usageEventsPerUnit: 50,
    }
    // expects:
    expect(overagePriceLabelFromPrice(price)).toBe(
      'Unnamed - £25.00 / 50'
    )
  })

  it('should handle an empty string name correctly', () => {
    // setup:
    const price: Price.ClientUsageRecord = {
      ...baseUsagePrice,
      name: '',
      currency: CurrencyCode.USD,
      unitPrice: 100,
      usageEventsPerUnit: 1,
    }
    // expects:
    expect(overagePriceLabelFromPrice(price)).toBe(' - $1.00 each')
  })
})
