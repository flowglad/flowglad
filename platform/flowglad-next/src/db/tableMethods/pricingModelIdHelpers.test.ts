import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'
import { NotFoundError } from '@/errors'
import {
  derivePricingModelIdCoalesce,
  derivePricingModelIdForLedgerEntryFromMaps,
  derivePricingModelIdFromMap,
} from './pricingModelIdHelpers'

/**
 * Helper to extract error from Result, throwing if not an error.
 * This helps with TypeScript type narrowing in tests.
 */
function expectError<T, E>(result: Result<T, E>): E {
  if (!Result.isError(result)) {
    throw new Error('Expected error result but got success')
  }
  return result.error
}

describe('pricingModelIdHelpers', () => {
  describe('derivePricingModelIdFromMap', () => {
    it('returns Result.ok with the pricingModelId when the entity is found in the map', () => {
      const pricingModelIdMap = new Map<string, string>([
        ['sub_123', 'pm_abc'],
        ['sub_456', 'pm_def'],
      ])

      const result = derivePricingModelIdFromMap({
        entityId: 'sub_123',
        entityType: 'subscription',
        pricingModelIdMap,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBe('pm_abc')
    })

    it('returns NotFoundError when the entity is not found in the map', () => {
      const pricingModelIdMap = new Map<string, string>([
        ['sub_123', 'pm_abc'],
      ])

      const result = derivePricingModelIdFromMap({
        entityId: 'sub_nonexistent',
        entityType: 'subscription',
        pricingModelIdMap,
      })

      expect(Result.isError(result)).toBe(true)
      const error = expectError(result)
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.resource).toBe('pricingModelId for subscription')
      expect(error.id).toBe('sub_nonexistent')
    })

    it('returns NotFoundError with the correct entity type in the error message for each supported entity type', () => {
      const emptyMap = new Map<string, string>()
      const entityTypes = [
        'subscription',
        'usageMeter',
        'price',
        'billingPeriod',
        'subscriptionItem',
      ] as const

      for (const entityType of entityTypes) {
        const result = derivePricingModelIdFromMap({
          entityId: 'test_id',
          entityType,
          pricingModelIdMap: emptyMap,
        })

        expect(Result.isError(result)).toBe(true)
        const error = expectError(result)
        expect(error.resource).toBe(
          `pricingModelId for ${entityType}`
        )
      }
    })
  })

  describe('derivePricingModelIdCoalesce', () => {
    it('returns the pricingModelId from the first source that has a matching entry', () => {
      const subscriptionMap = new Map<string, string>([
        ['sub_123', 'pm_from_subscription'],
      ])
      const usageMeterMap = new Map<string, string>([
        ['um_456', 'pm_from_usage_meter'],
      ])

      const result = derivePricingModelIdCoalesce([
        {
          entityId: 'sub_123',
          entityType: 'subscription',
          pricingModelIdMap: subscriptionMap,
        },
        {
          entityId: 'um_456',
          entityType: 'usageMeter',
          pricingModelIdMap: usageMeterMap,
        },
      ])

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBe('pm_from_subscription')
    })

    it('falls back to the second source when the first source entity ID is null', () => {
      const subscriptionMap = new Map<string, string>()
      const usageMeterMap = new Map<string, string>([
        ['um_456', 'pm_from_usage_meter'],
      ])

      const result = derivePricingModelIdCoalesce([
        {
          entityId: null,
          entityType: 'subscription',
          pricingModelIdMap: subscriptionMap,
        },
        {
          entityId: 'um_456',
          entityType: 'usageMeter',
          pricingModelIdMap: usageMeterMap,
        },
      ])

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBe('pm_from_usage_meter')
    })

    it('falls back to the second source when the first source entity ID is undefined', () => {
      const subscriptionMap = new Map<string, string>()
      const usageMeterMap = new Map<string, string>([
        ['um_456', 'pm_from_usage_meter'],
      ])

      const result = derivePricingModelIdCoalesce([
        {
          entityId: undefined,
          entityType: 'subscription',
          pricingModelIdMap: subscriptionMap,
        },
        {
          entityId: 'um_456',
          entityType: 'usageMeter',
          pricingModelIdMap: usageMeterMap,
        },
      ])

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBe('pm_from_usage_meter')
    })

    it('falls back to the second source when the first source entity ID is not in its map', () => {
      const subscriptionMap = new Map<string, string>([
        ['sub_other', 'pm_other'],
      ])
      const usageMeterMap = new Map<string, string>([
        ['um_456', 'pm_from_usage_meter'],
      ])

      const result = derivePricingModelIdCoalesce([
        {
          entityId: 'sub_not_found',
          entityType: 'subscription',
          pricingModelIdMap: subscriptionMap,
        },
        {
          entityId: 'um_456',
          entityType: 'usageMeter',
          pricingModelIdMap: usageMeterMap,
        },
      ])

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBe('pm_from_usage_meter')
    })

    it('returns NotFoundError listing all tried sources when no valid pricingModelId is found', () => {
      const subscriptionMap = new Map<string, string>()
      const usageMeterMap = new Map<string, string>()

      const result = derivePricingModelIdCoalesce([
        {
          entityId: 'sub_123',
          entityType: 'subscription',
          pricingModelIdMap: subscriptionMap,
        },
        {
          entityId: 'um_456',
          entityType: 'usageMeter',
          pricingModelIdMap: usageMeterMap,
        },
      ])

      expect(Result.isError(result)).toBe(true)
      const error = expectError(result)
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.resource).toBe('pricingModelId')
      expect(error.id).toBe('subscription:sub_123, usageMeter:um_456')
    })

    it('returns NotFoundError with "no sources provided" when all entity IDs are null or undefined', () => {
      const subscriptionMap = new Map<string, string>()
      const usageMeterMap = new Map<string, string>()

      const result = derivePricingModelIdCoalesce([
        {
          entityId: null,
          entityType: 'subscription',
          pricingModelIdMap: subscriptionMap,
        },
        {
          entityId: undefined,
          entityType: 'usageMeter',
          pricingModelIdMap: usageMeterMap,
        },
      ])

      expect(Result.isError(result)).toBe(true)
      const error = expectError(result)
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.resource).toBe('pricingModelId')
      expect(error.id).toBe('no sources provided')
    })

    it('returns NotFoundError with "no sources provided" when sources array is empty', () => {
      const result = derivePricingModelIdCoalesce([])

      expect(Result.isError(result)).toBe(true)
      const error = expectError(result)
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.id).toBe('no sources provided')
    })
  })

  describe('derivePricingModelIdForLedgerEntryFromMaps', () => {
    it('returns the pricingModelId from subscription when both subscription and usageMeter have valid entries (subscription takes priority)', () => {
      const subscriptionPricingModelIdMap = new Map<string, string>([
        ['sub_123', 'pm_from_subscription'],
      ])
      const usageMeterPricingModelIdMap = new Map<string, string>([
        ['um_456', 'pm_from_usage_meter'],
      ])

      const result = derivePricingModelIdForLedgerEntryFromMaps({
        subscriptionId: 'sub_123',
        usageMeterId: 'um_456',
        subscriptionPricingModelIdMap,
        usageMeterPricingModelIdMap,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBe('pm_from_subscription')
    })

    it('returns the pricingModelId from usageMeter when subscriptionId is null', () => {
      const subscriptionPricingModelIdMap = new Map<string, string>()
      const usageMeterPricingModelIdMap = new Map<string, string>([
        ['um_456', 'pm_from_usage_meter'],
      ])

      const result = derivePricingModelIdForLedgerEntryFromMaps({
        subscriptionId: null,
        usageMeterId: 'um_456',
        subscriptionPricingModelIdMap,
        usageMeterPricingModelIdMap,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBe('pm_from_usage_meter')
    })

    it('returns the pricingModelId from usageMeter when subscription is not found in its map', () => {
      const subscriptionPricingModelIdMap = new Map<string, string>([
        ['sub_other', 'pm_other'],
      ])
      const usageMeterPricingModelIdMap = new Map<string, string>([
        ['um_456', 'pm_from_usage_meter'],
      ])

      const result = derivePricingModelIdForLedgerEntryFromMaps({
        subscriptionId: 'sub_not_found',
        usageMeterId: 'um_456',
        subscriptionPricingModelIdMap,
        usageMeterPricingModelIdMap,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBe('pm_from_usage_meter')
    })

    it('returns NotFoundError when neither subscription nor usageMeter can provide a pricingModelId', () => {
      const subscriptionPricingModelIdMap = new Map<string, string>()
      const usageMeterPricingModelIdMap = new Map<string, string>()

      const result = derivePricingModelIdForLedgerEntryFromMaps({
        subscriptionId: 'sub_123',
        usageMeterId: 'um_456',
        subscriptionPricingModelIdMap,
        usageMeterPricingModelIdMap,
      })

      expect(Result.isError(result)).toBe(true)
      const error = expectError(result)
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.resource).toBe('pricingModelId')
      expect(error.id).toBe('subscription:sub_123, usageMeter:um_456')
    })

    it('returns NotFoundError when both subscriptionId and usageMeterId are null', () => {
      const subscriptionPricingModelIdMap = new Map<string, string>()
      const usageMeterPricingModelIdMap = new Map<string, string>()

      const result = derivePricingModelIdForLedgerEntryFromMaps({
        subscriptionId: null,
        usageMeterId: null,
        subscriptionPricingModelIdMap,
        usageMeterPricingModelIdMap,
      })

      expect(Result.isError(result)).toBe(true)
      const error = expectError(result)
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.id).toBe('no sources provided')
    })
  })
})
