import { describe, expect, it } from 'bun:test'
import { Dependency } from '@/utils/dependency'
import { createEffectsAccumulator } from './transactionEffectsHelpers'
import type { SyncInvalidation } from './types'

describe('createEffectsAccumulator', () => {
  describe('invalidateCache', () => {
    it('with context and sync dep adds SyncInvalidation to invalidations', () => {
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

      expect(effects.invalidations).toHaveLength(1)
      const inv = effects.invalidations[0] as SyncInvalidation
      expect(inv.dependency.type).toBe('customerSubscriptions')
      expect(inv.dependency.payload).toEqual({ customerId: 'cust_1' })
      expect(inv.context).toEqual(context)
    })

    it('with cache-only dep (no context) adds CacheInvalidation to invalidations', () => {
      const { effects, invalidateCache } = createEffectsAccumulator()

      invalidateCache(
        Dependency.organizationSettings({ orgId: 'org_1' })
      )

      expect(effects.invalidations).toHaveLength(1)
      const inv = effects.invalidations[0]
      expect(inv.dependency.type).toBe('organizationSettings')
      expect(inv.dependency.payload).toEqual({ orgId: 'org_1' })
      expect('context' in inv).toBe(false)
    })

    it('with multiple sync deps processes all of them', () => {
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

      expect(effects.invalidations).toHaveLength(2)
      const types = effects.invalidations.map(
        (inv) => inv.dependency.type
      )
      expect(types).toContain('customerSubscriptions')
      expect(types).toContain('subscription')
      // Both should have context (sync invalidations)
      for (const inv of effects.invalidations) {
        expect('context' in inv).toBe(true)
      }
    })

    it('with context and cache-only dep adds CacheInvalidation (no context stored)', () => {
      const { effects, invalidateCache } = createEffectsAccumulator()
      const context = {
        organizationId: 'org_1',
        pricingModelId: 'pm_1',
        livemode: true,
      }

      // Even with context provided, cache-only deps don't store context
      invalidateCache(
        context,
        Dependency.organizationSettings({ orgId: 'org_1' })
      )

      expect(effects.invalidations).toHaveLength(1)
      const inv = effects.invalidations[0]
      expect(inv.dependency.type).toBe('organizationSettings')
      expect('context' in inv).toBe(false)
    })

    it('with mixed sync and cache-only deps separates them correctly', () => {
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

      expect(effects.invalidations).toHaveLength(3)

      // Check sync invalidations have context
      const syncInvs = effects.invalidations.filter(
        (inv) => 'context' in inv
      ) as SyncInvalidation[]
      expect(syncInvs).toHaveLength(2)
      const syncTypes = syncInvs.map((inv) => inv.dependency.type)
      expect(syncTypes).toContain('customerSubscriptions')
      expect(syncTypes).toContain('subscription')

      // Check cache-only invalidation has no context
      const cacheInvs = effects.invalidations.filter(
        (inv) => !('context' in inv)
      )
      expect(cacheInvs).toHaveLength(1)
      expect(cacheInvs[0].dependency.type).toBe(
        'organizationSettings'
      )
    })

    it('with legacy string keys adds only to cacheInvalidations', () => {
      const { effects, invalidateCache } = createEffectsAccumulator()

      invalidateCache('legacy:key:1', 'legacy:key:2')

      expect(effects.invalidations).toHaveLength(0)
      expect(effects.cacheInvalidations).toHaveLength(2)
      expect(effects.cacheInvalidations).toContain('legacy:key:1')
      expect(effects.cacheInvalidations).toContain('legacy:key:2')
    })

    it('effects accumulator starts with empty invalidations array', () => {
      const { effects } = createEffectsAccumulator()

      expect(effects.invalidations).toEqual([])
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
