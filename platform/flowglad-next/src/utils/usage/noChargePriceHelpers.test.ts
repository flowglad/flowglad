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
    it('generates slug with _no_charge suffix for a simple meter slug', () => {
      const result = getNoChargeSlugForMeter('api_requests')
      expect(result).toBe('api_requests_no_charge')
    })

    it('generates slug with _no_charge suffix for a meter slug with underscores', () => {
      const result = getNoChargeSlugForMeter('storage_gb_usage')
      expect(result).toBe('storage_gb_usage_no_charge')
    })

    it('generates slug with _no_charge suffix for a single word meter slug', () => {
      const result = getNoChargeSlugForMeter('messages')
      expect(result).toBe('messages_no_charge')
    })
  })

  describe('isNoChargePrice', () => {
    it('returns true for slugs ending with _no_charge', () => {
      expect(isNoChargePrice('api_requests_no_charge')).toBe(true)
      expect(isNoChargePrice('storage_no_charge')).toBe(true)
      expect(isNoChargePrice('messages_no_charge')).toBe(true)
    })

    it('returns false for slugs not ending with _no_charge', () => {
      expect(isNoChargePrice('api_requests')).toBe(false)
      expect(isNoChargePrice('storage')).toBe(false)
      expect(isNoChargePrice('no_charge_extra')).toBe(false)
      expect(isNoChargePrice('no_charge_meter')).toBe(false)
    })

    it('returns false for slugs containing but not ending with _no_charge', () => {
      expect(isNoChargePrice('no_charge_storage')).toBe(false)
      expect(isNoChargePrice('_no_charge_')).toBe(false)
    })

    it('returns true only for exact suffix match', () => {
      // _no_charge is the exact suffix
      expect(isNoChargePrice('test_no_charge')).toBe(true)
      // _no_chargee has an extra character
      expect(isNoChargePrice('test_no_chargee')).toBe(false)
      // _no_charg is missing a character
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

    it('creates a price insert with correct no charge slug', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.slug).toBe('api_requests_no_charge')
    })

    it('creates a price insert with type=Usage', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.type).toBe(PriceType.Usage)
    })

    it('creates a price insert with unitPrice=0', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.unitPrice).toBe(0)
    })

    it('creates a price insert with usageEventsPerUnit=1', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.usageEventsPerUnit).toBe(1)
    })

    it('creates a price insert with correct usageMeterId', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.usageMeterId).toBe('meter_123')
    })

    it('creates a price insert with correct pricingModelId', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.pricingModelId).toBe('pm_456')
    })

    it('creates a price insert with productId=null', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.productId).toBe(null)
    })

    it('creates a price insert with isDefault=false by default', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.isDefault).toBe(false)
    })

    it('creates a price insert with active=true', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.active).toBe(true)
    })

    it('creates a price insert with correct currency', () => {
      const resultUSD = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })
      expect(resultUSD.currency).toBe(CurrencyCode.USD)

      const resultGBP = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.GBP,
      })
      expect(resultGBP.currency).toBe(CurrencyCode.GBP)
    })

    it('creates a price insert with name derived from meter name', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.name).toBe('API Requests - No Charge')
    })

    it('creates a price insert with livemode from meter', () => {
      const livemeter = { ...mockUsageMeter, livemode: true }
      const resultLive = createNoChargePriceInsert(livemeter, {
        currency: CurrencyCode.USD,
      })
      expect(resultLive.livemode).toBe(true)

      const testMeter = { ...mockUsageMeter, livemode: false }
      const resultTest = createNoChargePriceInsert(testMeter, {
        currency: CurrencyCode.USD,
      })
      expect(resultTest.livemode).toBe(false)
    })

    it('creates a price insert with intervalUnit=Month and intervalCount=1', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.intervalUnit).toBe(IntervalUnit.Month)
      expect(result.intervalCount).toBe(1)
    })

    it('creates a price insert with trialPeriodDays=null and externalId=null', () => {
      const result = createNoChargePriceInsert(mockUsageMeter, {
        currency: CurrencyCode.USD,
      })

      expect(result.trialPeriodDays).toBe(null)
      expect(result.externalId).toBe(null)
    })
  })
})
