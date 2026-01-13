import { describe, expect, it } from 'vitest'
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

describe('noChargePriceHelpers', () => {
  describe('getNoChargeSlugForMeter', () => {
    it('appends _no_charge suffix to various slug formats', () => {
      // Simple slug
      expect(getNoChargeSlugForMeter('api_requests')).toBe(
        'api_requests_no_charge'
      )
      // Slug with underscores
      expect(getNoChargeSlugForMeter('storage_gb_usage')).toBe(
        'storage_gb_usage_no_charge'
      )
      // Single word slug
      expect(getNoChargeSlugForMeter('messages')).toBe(
        'messages_no_charge'
      )
    })
  })

  describe('isNoChargePrice', () => {
    it('identifies slugs ending with _no_charge suffix', () => {
      // Valid no_charge slugs
      expect(isNoChargePrice('api_requests_no_charge')).toBe(true)
      expect(isNoChargePrice('storage_no_charge')).toBe(true)
      expect(isNoChargePrice('messages_no_charge')).toBe(true)
      expect(isNoChargePrice('test_no_charge')).toBe(true)

      // Invalid: does not end with _no_charge
      expect(isNoChargePrice('api_requests')).toBe(false)
      expect(isNoChargePrice('storage')).toBe(false)
      expect(isNoChargePrice('no_charge_extra')).toBe(false)
      expect(isNoChargePrice('no_charge_meter')).toBe(false)
      expect(isNoChargePrice('no_charge_storage')).toBe(false)
      expect(isNoChargePrice('_no_charge_')).toBe(false)

      // Invalid: partial suffix match
      expect(isNoChargePrice('test_no_chargee')).toBe(false)
      expect(isNoChargePrice('test_no_charg')).toBe(false)
    })
  })

  describe('createNoChargePriceInsert', () => {
    const mockUsageMeter = {
      id: 'meter_123',
      name: 'API Requests',
      slug: 'api_requests',
      pricingModelId: 'pm_456',
      organizationId: 'org_789',
      livemode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      position: 0,
      createdByCommit: null,
      updatedByCommit: null,
      aggregationType: UsageMeterAggregationType.Sum,
    }

    it('creates a complete no_charge price insert with all expected properties', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      // Slug and name derived from meter
      expect(result.slug).toBe('api_requests_no_charge')
      expect(result.name).toBe('API Requests - No Charge')

      // References to meter and pricing model
      expect(result.usageMeterId).toBe('meter_123')
      expect(result.pricingModelId).toBe('pm_456')
      expect(result.productId).toBe(null)

      // No charge price defaults
      expect(result.type).toBe(PriceType.Usage)
      expect(result.unitPrice).toBe(0)
      expect(result.usageEventsPerUnit).toBe(1)
      expect(result.isDefault).toBe(false)
      expect(result.active).toBe(true)

      // Interval settings
      expect(result.intervalUnit).toBe(IntervalUnit.Month)
      expect(result.intervalCount).toBe(1)

      // Nullable fields
      expect(result.trialPeriodDays).toBe(null)
      expect(result.externalId).toBe(null)

      // Passed through values
      expect(result.currency).toBe(CurrencyCode.USD)
      expect(result.livemode).toBe(false)
    })

    it('uses the provided currency parameter', () => {
      const resultUSD = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })
      expect(resultUSD.currency).toBe(CurrencyCode.USD)

      const resultGBP = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.GBP,
      })
      expect(resultGBP.currency).toBe(CurrencyCode.GBP)
    })

    it('inherits livemode from the usage meter', () => {
      const liveMeter = { ...mockUsageMeter, livemode: true }
      const resultLive = createNoChargePriceInsert(liveMeter, {
        currency: CurrencyCode.USD,
      })
      expect(resultLive.livemode).toBe(true)

      const testMeter = { ...mockUsageMeter, livemode: false }
      const resultTest = createNoChargePriceInsert(testMeter, {
        currency: CurrencyCode.USD,
      })
      expect(resultTest.livemode).toBe(false)
    })
  })
})
