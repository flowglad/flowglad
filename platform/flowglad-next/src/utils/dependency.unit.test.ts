import { describe, expect, it } from 'bun:test'
import {
  type AnyDependency,
  type CacheDependency,
  type CustomerSubscriptionsDep,
  Dependency,
  dependencyToCacheKey,
  isCacheOnlyDependency,
  isSyncDependency,
  type OrganizationSettingsDep,
  type SubscriptionDep,
  type SyncDependency,
  type SyncPayload,
} from '@/utils/dependency'

describe('Dependency', () => {
  describe('customerSubscriptions', () => {
    it('creates a sync-enabled dependency with the correct type, payload, and syncEnabled flag', () => {
      const dep = Dependency.customerSubscriptions({
        customerId: 'cust_123',
      })

      expect(dep.type).toBe('customerSubscriptions')
      expect(dep.payload).toEqual({ customerId: 'cust_123' })
      expect(dep.syncEnabled).toBe(true)

      // Type-level check: dep should be assignable to CustomerSubscriptionsDep
      const _typedDep: CustomerSubscriptionsDep = dep
      void _typedDep
    })
  })

  describe('subscription', () => {
    it('creates a sync-enabled dependency with the correct type, payload, and syncEnabled flag', () => {
      const dep = Dependency.subscription({
        subscriptionId: 'sub_456',
      })

      expect(dep.type).toBe('subscription')
      expect(dep.payload).toEqual({ subscriptionId: 'sub_456' })
      expect(dep.syncEnabled).toBe(true)

      // Type-level check: dep should be assignable to SubscriptionDep
      const _typedDep: SubscriptionDep = dep
      void _typedDep
    })
  })

  describe('organizationSettings', () => {
    it('creates a cache-only dependency with the correct type, payload, and syncEnabled flag', () => {
      const dep = Dependency.organizationSettings({
        orgId: 'org_789',
      })

      expect(dep.type).toBe('organizationSettings')
      expect(dep.payload).toEqual({ orgId: 'org_789' })
      expect(dep.syncEnabled).toBe(false)

      // Type-level check: dep should be assignable to OrganizationSettingsDep
      const _typedDep: OrganizationSettingsDep = dep
      void _typedDep
    })
  })

  describe('apiKeyLookup', () => {
    it('creates a cache-only dependency with the correct type, payload, and syncEnabled flag', () => {
      const dep = Dependency.apiKeyLookup({ keyHash: 'abc123hash' })

      expect(dep.type).toBe('apiKeyLookup')
      expect(dep.payload).toEqual({ keyHash: 'abc123hash' })
      expect(dep.syncEnabled).toBe(false)
    })
  })
})

describe('dependencyToCacheKey', () => {
  it('derives the correct Redis key for customerSubscriptions dependency', () => {
    const dep = Dependency.customerSubscriptions({
      customerId: 'cust_123',
    })
    const key = dependencyToCacheKey(dep)

    expect(key).toBe('customerSubscriptions:cust_123')
  })

  it('derives the correct Redis key for subscription dependency', () => {
    const dep = Dependency.subscription({ subscriptionId: 'sub_456' })
    const key = dependencyToCacheKey(dep)

    expect(key).toBe('subscription:sub_456')
  })

  it('derives the correct Redis key for organizationSettings dependency', () => {
    const dep = Dependency.organizationSettings({ orgId: 'org_789' })
    const key = dependencyToCacheKey(dep)

    expect(key).toBe('organizationSettings:org_789')
  })

  it('derives the correct Redis key for apiKeyLookup dependency', () => {
    const dep = Dependency.apiKeyLookup({ keyHash: 'abc123hash' })
    const key = dependencyToCacheKey(dep)

    expect(key).toBe('apiKeyLookup:abc123hash')
  })
})

describe('isSyncDependency', () => {
  it('returns true for customerSubscriptions dependency', () => {
    const dep = Dependency.customerSubscriptions({
      customerId: 'cust_123',
    })

    expect(isSyncDependency(dep)).toBe(true)

    // Verify type narrowing works
    if (isSyncDependency(dep)) {
      const _narrowed: SyncDependency = dep
      void _narrowed
    }
  })

  it('returns true for subscription dependency', () => {
    const dep = Dependency.subscription({ subscriptionId: 'sub_456' })

    expect(isSyncDependency(dep)).toBe(true)
  })

  it('returns false for organizationSettings dependency', () => {
    const dep = Dependency.organizationSettings({ orgId: 'org_789' })

    expect(isSyncDependency(dep)).toBe(false)
  })

  it('returns false for apiKeyLookup dependency', () => {
    const dep = Dependency.apiKeyLookup({ keyHash: 'abc123hash' })

    expect(isSyncDependency(dep)).toBe(false)
  })
})

describe('isCacheOnlyDependency', () => {
  it('returns false for customerSubscriptions dependency', () => {
    const dep = Dependency.customerSubscriptions({
      customerId: 'cust_123',
    })

    expect(isCacheOnlyDependency(dep)).toBe(false)
  })

  it('returns true for organizationSettings dependency', () => {
    const dep = Dependency.organizationSettings({ orgId: 'org_789' })

    expect(isCacheOnlyDependency(dep)).toBe(true)

    // Verify type narrowing works
    if (isCacheOnlyDependency(dep)) {
      const _narrowed: CacheDependency = dep
      void _narrowed
    }
  })

  it('returns true for apiKeyLookup dependency', () => {
    const dep = Dependency.apiKeyLookup({ keyHash: 'abc123hash' })

    expect(isCacheOnlyDependency(dep)).toBe(true)
  })
})

describe('Type-level tests', () => {
  it('SyncPayload extracts correct payload types', () => {
    // These are compile-time checks - if they compile, the types work correctly

    // SyncPayload<'customerSubscriptions'> should be { customerId: string }
    type CustomerPayload = SyncPayload<'customerSubscriptions'>
    const _customerPayload: CustomerPayload = {
      customerId: 'cust_123',
    }
    void _customerPayload

    // SyncPayload<'subscription'> should be { subscriptionId: string }
    type SubPayload = SyncPayload<'subscription'>
    const _subPayload: SubPayload = { subscriptionId: 'sub_456' }
    void _subPayload

    // If the above compiles, the test passes
    expect(true).toBe(true)
  })

  it('AnyDependency accepts all dependency types', () => {
    // All dependency types should be assignable to AnyDependency
    const deps: AnyDependency[] = [
      Dependency.customerSubscriptions({ customerId: 'cust_123' }),
      Dependency.subscription({ subscriptionId: 'sub_456' }),
      Dependency.organizationSettings({ orgId: 'org_789' }),
      Dependency.apiKeyLookup({ keyHash: 'abc123hash' }),
    ]

    expect(deps).toHaveLength(4)
  })

  it('SyncDependency only accepts sync-enabled dependencies', () => {
    // These should compile
    const syncDeps: SyncDependency[] = [
      Dependency.customerSubscriptions({ customerId: 'cust_123' }),
      Dependency.subscription({ subscriptionId: 'sub_456' }),
    ]

    // This would NOT compile (and is correctly rejected by TypeScript):
    // const invalidSyncDep: SyncDependency = Dependency.organizationSettings({ orgId: 'org_789' })

    expect(syncDeps).toHaveLength(2)
  })

  it('CacheDependency only accepts cache-only dependencies', () => {
    // These should compile
    const cacheDeps: CacheDependency[] = [
      Dependency.organizationSettings({ orgId: 'org_789' }),
      Dependency.apiKeyLookup({ keyHash: 'abc123hash' }),
    ]

    // This would NOT compile (and is correctly rejected by TypeScript):
    // const invalidCacheDep: CacheDependency = Dependency.customerSubscriptions({ customerId: 'cust_123' })

    expect(cacheDeps).toHaveLength(2)
  })
})
