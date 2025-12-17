import { describe, expect, it } from 'vitest'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import {
  isNonManualSubscriptionItem,
  isSubscriptionItemActive,
  isSubscriptionItemActiveAndNonManual,
} from './subscriptionItemHelpers'

describe('subscriptionItemHelpers', () => {
  const now = Date.now()
  const oneDayInMs = 24 * 60 * 60 * 1000
  const pastDate = now - oneDayInMs
  const futureDate = now + oneDayInMs

  describe('isSubscriptionItemActive', () => {
    it('should return true when expiredAt is undefined', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> = {
        expiredAt: undefined,
      }
      expect(isSubscriptionItemActive(item)).toBe(true)
    })

    it('should return true when expiredAt is null', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> = {
        expiredAt: null,
      }
      expect(isSubscriptionItemActive(item)).toBe(true)
    })

    it('should return true when expiredAt is in the future', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> = {
        expiredAt: futureDate,
      }
      expect(isSubscriptionItemActive(item)).toBe(true)
    })

    it('should return false when expiredAt is in the past', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> = {
        expiredAt: pastDate,
      }
      expect(isSubscriptionItemActive(item)).toBe(false)
    })

    it('should return false when expiredAt is exactly now', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> = {
        expiredAt: now,
      }
      expect(isSubscriptionItemActive(item)).toBe(false)
    })
  })

  describe('isNonManualSubscriptionItem', () => {
    it('should return true when manuallyCreated is false and priceId is a string', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: false,
        priceId: 'price_123',
      }
      expect(isNonManualSubscriptionItem(item)).toBe(true)
    })

    it('should return true when manuallyCreated is undefined and priceId is a string', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: undefined,
        priceId: 'price_123',
      }
      expect(isNonManualSubscriptionItem(item)).toBe(true)
    })

    it('should return false when manuallyCreated is true', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: true,
        priceId: 'price_123',
      }
      expect(isNonManualSubscriptionItem(item)).toBe(false)
    })

    it('should return false when priceId is null', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: false,
        priceId: null,
      }
      expect(isNonManualSubscriptionItem(item)).toBe(false)
    })

    it('should return false when priceId is undefined', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: false,
        priceId: undefined,
      }
      expect(isNonManualSubscriptionItem(item)).toBe(false)
    })

    it('should return false when manuallyCreated is true and priceId is null', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: true,
        priceId: null,
      }
      expect(isNonManualSubscriptionItem(item)).toBe(false)
    })

    it('should return false when both manuallyCreated and priceId are undefined', () => {
      const item: Pick<
        SubscriptionItem.ClientUpsert,
        'manuallyCreated' | 'priceId'
      > = {
        manuallyCreated: undefined,
        priceId: undefined,
      }
      expect(isNonManualSubscriptionItem(item)).toBe(false)
    })
  })

  describe('isSubscriptionItemActiveAndNonManual', () => {
    it('should return true when item is active and non-manual', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: undefined,
        manuallyCreated: false,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(true)
    })

    it('should return true when expiredAt is in future and item is non-manual', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: futureDate,
        manuallyCreated: false,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(true)
    })

    it('should return false when item is expired', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: pastDate,
        manuallyCreated: false,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(false)
    })

    it('should return false when item is manually created', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: undefined,
        manuallyCreated: true,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(false)
    })

    it('should return false when item has no priceId', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: undefined,
        manuallyCreated: false,
        priceId: null,
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(false)
    })

    it('should return false when item is both expired and manually created', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: pastDate,
        manuallyCreated: true,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(false)
    })

    it('should return false when item is expired and has no priceId', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: pastDate,
        manuallyCreated: false,
        priceId: null,
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(false)
    })

    it('should return true when manuallyCreated is undefined (defaults to false) and priceId exists', () => {
      const item: Pick<SubscriptionItem.Upsert, 'expiredAt'> &
        Pick<
          SubscriptionItem.ClientUpsert,
          'manuallyCreated' | 'priceId'
        > = {
        expiredAt: undefined,
        manuallyCreated: undefined,
        priceId: 'price_123',
      }
      expect(isSubscriptionItemActiveAndNonManual(item)).toBe(true)
    })
  })
})
