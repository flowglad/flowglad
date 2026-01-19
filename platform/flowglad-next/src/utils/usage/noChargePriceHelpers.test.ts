import { describe, expect, it } from 'vitest'
import { RESERVED_USAGE_PRICE_SLUG_SUFFIX } from '@/db/schema/prices'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  CurrencyCode,
  IntervalUnit,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import {
  createNoChargePriceInsert,
  getNoChargeSlugForMeter,
  isNoChargePrice,
} from './noChargePriceHelpers'

describe('getNoChargeSlugForMeter', () => {
  it('appends _no_charge suffix to simple slugs', () => {
    const result = getNoChargeSlugForMeter('api_calls')
    expect(result).toBe('api_calls_no_charge')
  })

  it('appends _no_charge suffix to slugs with hyphens', () => {
    const result = getNoChargeSlugForMeter('api-requests')
    expect(result).toBe('api-requests_no_charge')
  })

  it('appends _no_charge suffix to slugs with numbers', () => {
    const result = getNoChargeSlugForMeter('tier_1_requests')
    expect(result).toBe('tier_1_requests_no_charge')
  })

  it('appends _no_charge suffix to empty string', () => {
    const result = getNoChargeSlugForMeter('')
    expect(result).toBe('_no_charge')
  })

  it('uses the RESERVED_USAGE_PRICE_SLUG_SUFFIX constant', () => {
    const result = getNoChargeSlugForMeter('test')
    expect(result).toBe(`test${RESERVED_USAGE_PRICE_SLUG_SUFFIX}`)
  })
})

describe('isNoChargePrice', () => {
  it('returns true for slugs ending with _no_charge', () => {
    expect(isNoChargePrice('api_calls_no_charge')).toBe(true)
    expect(isNoChargePrice('storage_gb_no_charge')).toBe(true)
    expect(isNoChargePrice('requests_no_charge')).toBe(true)
  })

  it('returns false for slugs containing _no_charge but not at the end', () => {
    expect(isNoChargePrice('no_charge_extra')).toBe(false)
    expect(isNoChargePrice('no_charge_price')).toBe(false)
  })

  it('returns false for slugs not containing _no_charge', () => {
    expect(isNoChargePrice('api_calls')).toBe(false)
    expect(isNoChargePrice('my_price')).toBe(false)
    expect(isNoChargePrice('free')).toBe(false)
    expect(isNoChargePrice('')).toBe(false)
  })

  it('returns false for slugs with partial suffix matches', () => {
    expect(isNoChargePrice('no_charge')).toBe(false) // missing underscore prefix
    expect(isNoChargePrice('_no_charg')).toBe(false) // missing 'e'
    expect(isNoChargePrice('test_nocharge')).toBe(false) // missing underscore
  })

  it('returns true for just the suffix alone', () => {
    // This is a valid slug ending with _no_charge
    expect(isNoChargePrice('_no_charge')).toBe(true)
  })
})

describe('createNoChargePriceInsert', () => {
  const createMockUsageMeter = (
    overrides: Partial<UsageMeter.Record> = {}
  ): UsageMeter.Record => ({
    id: 'um_123',
    name: 'API Calls',
    slug: 'api_calls',
    pricingModelId: 'pm_456',
    organizationId: 'org_789',
    livemode: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdByCommit: null,
    updatedByCommit: null,
    position: 1,
    aggregationType: UsageMeterAggregationType.Sum,
    ...overrides,
  })

  it('creates a complete no-charge price insert with all expected properties', () => {
    const usageMeter = createMockUsageMeter()
    const result = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.USD,
    })

    expect(result.type).toBe(PriceType.Usage)
    expect(result.name).toBe('API Calls - No Charge')
    expect(result.slug).toBe('api_calls_no_charge')
    expect(result.usageMeterId).toBe('um_123')
    expect(result.pricingModelId).toBe('pm_456')
    expect(result.productId).toBeNull()
    expect(result.unitPrice).toBe(0)
    expect(result.usageEventsPerUnit).toBe(1)
    expect(result.isDefault).toBe(false)
    expect(result.active).toBe(true)
    expect(result.currency).toBe(CurrencyCode.USD)
    expect(result.intervalUnit).toBe(IntervalUnit.Month)
    expect(result.intervalCount).toBe(1)
    expect(result.trialPeriodDays).toBeNull()
    expect(result.externalId).toBeNull()
    expect(result.livemode).toBe(false)
  })

  it('inherits livemode from the usage meter', () => {
    const livemodeUsageMeter = createMockUsageMeter({
      livemode: true,
    })
    const result = createNoChargePriceInsert(livemodeUsageMeter, {
      currency: CurrencyCode.USD,
    })

    expect(result.livemode).toBe(true)
  })

  it('uses the provided currency', () => {
    const usageMeter = createMockUsageMeter()

    const usdResult = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.USD,
    })
    expect(usdResult.currency).toBe(CurrencyCode.USD)

    const eurResult = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.EUR,
    })
    expect(eurResult.currency).toBe(CurrencyCode.EUR)

    const gbpResult = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.GBP,
    })
    expect(gbpResult.currency).toBe(CurrencyCode.GBP)
  })

  it('generates name from usage meter name', () => {
    const usageMeter = createMockUsageMeter({ name: 'Storage GB' })
    const result = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.USD,
    })

    expect(result.name).toBe('Storage GB - No Charge')
  })

  it('generates slug from usage meter slug', () => {
    const usageMeter = createMockUsageMeter({ slug: 'storage_gb' })
    const result = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.USD,
    })

    expect(result.slug).toBe('storage_gb_no_charge')
  })

  it('uses pricingModelId and usageMeterId from the usage meter', () => {
    const usageMeter = createMockUsageMeter({
      id: 'um_custom_id',
      pricingModelId: 'pm_custom_id',
    })
    const result = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.USD,
    })

    expect(result.usageMeterId).toBe('um_custom_id')
    expect(result.pricingModelId).toBe('pm_custom_id')
  })

  it('always sets productId to null (usage prices do not belong to products)', () => {
    const usageMeter = createMockUsageMeter()
    const result = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.USD,
    })

    expect(result.productId).toBeNull()
  })

  it('always sets unitPrice to 0 (no charge means free)', () => {
    const usageMeter = createMockUsageMeter()
    const result = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.USD,
    })

    expect(result.unitPrice).toBe(0)
  })

  it('always sets usageEventsPerUnit to 1', () => {
    const usageMeter = createMockUsageMeter()
    const result = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.USD,
    })

    expect(result.usageEventsPerUnit).toBe(1)
  })

  it('always sets isDefault to false (caller should override based on context)', () => {
    const usageMeter = createMockUsageMeter()
    const result = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.USD,
    })

    expect(result.isDefault).toBe(false)
  })

  it('always sets active to true', () => {
    const usageMeter = createMockUsageMeter()
    const result = createNoChargePriceInsert(usageMeter, {
      currency: CurrencyCode.USD,
    })

    expect(result.active).toBe(true)
  })
})
