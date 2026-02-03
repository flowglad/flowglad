import { describe, expect, it } from 'bun:test'
import { Dependency } from '@/utils/dependency'
import { createEffectsAccumulator } from './transactionEffectsHelpers'

describe('createEffectsAccumulator', () => {
  describe('invalidateCache', () => {
    it('invalidateCache with context and sync dep adds to both cacheInvalidations and syncInvalidations', () => {
      const { effects, invalidateCache } = createEffectsAccumulator()
      const context = {
        organizationId: 'org_1',
        pricingModelId: 'pm_1',
        livemode: true,
      }

      invalidateCache(
        context,
        Dependency.customerSubscriptions({ customerId: 'cust_1' })
      )

      expect(effects.cacheInvalidations).toHaveLength(1)
      expect(effects.cacheInvalidations[0]).toBe(
        'customerSubscriptions:cust_1'
      )
      expect(effects.syncInvalidations).toHaveLength(1)
      expect(effects.syncInvalidations[0].dependency.type).toBe(
        'customerSubscriptions'
      )
      expect(effects.syncInvalidations[0].dependency.payload).toEqual(
        {
          customerId: 'cust_1',
        }
      )
      expect(effects.syncInvalidations[0].context).toEqual(context)
    })

    it('invalidateCache with cache-only dep only adds to cacheInvalidations', () => {
      const { effects, invalidateCache } = createEffectsAccumulator()

      invalidateCache(
        Dependency.organizationSettings({ orgId: 'org_1' })
      )

      expect(effects.cacheInvalidations).toHaveLength(1)
      expect(effects.cacheInvalidations[0]).toBe(
        'organizationSettings:org_1'
      )
      expect(effects.syncInvalidations).toHaveLength(0)
    })

    it('invalidateCache with multiple deps processes all of them', () => {
      const { effects, invalidateCache } = createEffectsAccumulator()
      const context = {
        organizationId: 'org_1',
        pricingModelId: 'pm_1',
        livemode: true,
      }

      invalidateCache(
        context,
        Dependency.customerSubscriptions({ customerId: 'cust_1' }),
        Dependency.subscription({ subscriptionId: 'sub_1' })
      )

      expect(effects.cacheInvalidations).toHaveLength(2)
      expect(effects.cacheInvalidations).toContain(
        'customerSubscriptions:cust_1'
      )
      expect(effects.cacheInvalidations).toContain(
        'subscription:sub_1'
      )
      expect(effects.syncInvalidations).toHaveLength(2)
      expect(effects.syncInvalidations[0].dependency.type).toBe(
        'customerSubscriptions'
      )
      expect(effects.syncInvalidations[1].dependency.type).toBe(
        'subscription'
      )
    })

    it('invalidateCache with context and cache-only dep adds only to cacheInvalidations', () => {
      const { effects, invalidateCache } = createEffectsAccumulator()
      const context = {
        organizationId: 'org_1',
        pricingModelId: 'pm_1',
        livemode: true,
      }

      // Even with context, cache-only deps don't trigger sync
      invalidateCache(
        context,
        Dependency.organizationSettings({ orgId: 'org_1' })
      )

      expect(effects.cacheInvalidations).toHaveLength(1)
      expect(effects.cacheInvalidations[0]).toBe(
        'organizationSettings:org_1'
      )
      expect(effects.syncInvalidations).toHaveLength(0)
    })

    it('invalidateCache with mixed sync and cache-only deps only syncs the sync-enabled ones', () => {
      const { effects, invalidateCache } = createEffectsAccumulator()
      const context = {
        organizationId: 'org_1',
        pricingModelId: 'pm_1',
        livemode: false,
      }

      invalidateCache(
        context,
        Dependency.customerSubscriptions({ customerId: 'cust_1' }),
        Dependency.organizationSettings({ orgId: 'org_1' }),
        Dependency.subscription({ subscriptionId: 'sub_1' })
      )

      // All deps should be in cache invalidations
      expect(effects.cacheInvalidations).toHaveLength(3)
      expect(effects.cacheInvalidations).toContain(
        'customerSubscriptions:cust_1'
      )
      expect(effects.cacheInvalidations).toContain(
        'organizationSettings:org_1'
      )
      expect(effects.cacheInvalidations).toContain(
        'subscription:sub_1'
      )

      // Only sync-enabled deps should be in sync invalidations
      expect(effects.syncInvalidations).toHaveLength(2)
      const syncTypes = effects.syncInvalidations.map(
        (s) => s.dependency.type
      )
      expect(syncTypes).toContain('customerSubscriptions')
      expect(syncTypes).toContain('subscription')
      expect(syncTypes).not.toContain('organizationSettings')
    })

    it('invalidateCache with legacy string keys adds only to cacheInvalidations', () => {
      const { effects, invalidateCache } = createEffectsAccumulator()

      invalidateCache('legacy:key:1', 'legacy:key:2')

      expect(effects.cacheInvalidations).toHaveLength(2)
      expect(effects.cacheInvalidations).toContain('legacy:key:1')
      expect(effects.cacheInvalidations).toContain('legacy:key:2')
      expect(effects.syncInvalidations).toHaveLength(0)
    })

    it('effects accumulator starts with empty syncInvalidations array', () => {
      const { effects } = createEffectsAccumulator()

      expect(effects.syncInvalidations).toEqual([])
    })
  })

  // TYPE TEST: This should NOT compile - sync dep requires context
  // Uncomment to verify TypeScript catches this:
  // it('type error when calling invalidateCache with sync dep without context', () => {
  //   const { invalidateCache } = createEffectsAccumulator()
  //   // Error: SyncDependency not assignable to CacheDependency
  //   invalidateCache(Dependency.customerSubscriptions({ customerId: 'cust_1' }))
  // })
})
