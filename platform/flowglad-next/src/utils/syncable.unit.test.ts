import { beforeEach, describe, expect, it } from 'bun:test'
import {
  getSyncableConfig,
  getSyncablesAffectedBy,
  isSyncTypeRegistered,
  syncable,
  syncableRegistry,
} from './syncable'

describe('syncable', () => {
  beforeEach(() => {
    // Clear registry between tests
    syncableRegistry.clear()
  })

  it('registers resolver and affectedBy at call time', () => {
    const mockResolver = async ({
      input: _input,
    }: {
      input: { customerId: string }
      ctx: unknown
    }) => ({ data: [] })
    const wrapped = syncable('customerSubscriptions', {
      resolver: mockResolver,
      affectedBy: {
        customerSubscriptions: 'direct',
        subscription: async ({ payload: _payload }) => ({
          customerId: 'cust_123',
        }),
      },
    })

    expect(typeof wrapped).toBe('function')

    const entry = syncableRegistry.get('customerSubscriptions')
    expect(entry?.affectedBy.customerSubscriptions).toBe('direct')
    expect(typeof entry?.affectedBy.subscription).toBe('function')
  })

  it('returns the original resolver function that can be invoked', async () => {
    const expectedResult = { subscriptions: [{ id: 'sub_1' }] }
    const mockResolver = async ({
      input: _input,
    }: {
      input: { customerId: string }
      ctx: { userId: string }
    }) => expectedResult

    const wrapped = syncable('customerSubscriptions', {
      resolver: mockResolver,
      affectedBy: {
        customerSubscriptions: 'direct',
      },
    })

    const result = await wrapped({
      input: { customerId: 'cust_123' },
      ctx: { userId: 'user_1' },
    })

    expect(result).toEqual(expectedResult)
  })

  it('overwrites previous registration when called twice with same type', () => {
    const firstResolver = async ({
      input: _input,
    }: {
      input: { customerId: string }
      ctx: unknown
    }) => ({
      first: true,
    })
    const secondResolver = async ({
      input: _input,
    }: {
      input: { customerId: string }
      ctx: unknown
    }) => ({
      second: true,
    })

    syncable('customerSubscriptions', {
      resolver: firstResolver,
      affectedBy: { customerSubscriptions: 'direct' },
    })

    syncable('customerSubscriptions', {
      resolver: secondResolver,
      affectedBy: {
        customerSubscriptions: 'direct',
        subscription: async () => ({ customerId: 'derived' }),
      },
    })

    expect(syncableRegistry.size).toBe(1)
    const entry = syncableRegistry.get('customerSubscriptions')
    expect(typeof entry?.affectedBy.subscription).toBe('function')
  })
})

describe('getSyncablesAffectedBy', () => {
  beforeEach(() => {
    syncableRegistry.clear()
  })

  it('returns matching syncables when affectedBy declares the invalidation type', () => {
    syncable('customerSubscriptions', {
      resolver: async ({
        input: _input,
      }: {
        input: { customerId: string }
        ctx: unknown
      }) => ({
        data: [],
      }),
      affectedBy: {
        customerSubscriptions: 'direct',
        subscription: async ({ payload: _payload }) => ({
          customerId: 'cust_123',
        }),
      },
    })

    const affected = getSyncablesAffectedBy('subscription')

    expect(affected).toHaveLength(1)
    expect(affected[0].syncType).toBe('customerSubscriptions')
    expect(typeof affected[0].affectedByFn).toBe('function')
    expect(typeof affected[0].resolver).toBe('function')
  })

  it('returns multiple syncables when multiple types are affected by same invalidation', () => {
    syncable('customerSubscriptions', {
      resolver: async ({
        input: _input,
      }: {
        input: { customerId: string }
        ctx: unknown
      }) => ({
        subscriptions: [],
      }),
      affectedBy: {
        subscription: async ({ payload: _payload }) => ({
          customerId: 'cust_from_sub',
        }),
      },
    })

    syncable('subscription', {
      resolver: async ({
        input: _input,
      }: {
        input: { subscriptionId: string }
        ctx: unknown
      }) => ({
        subscription: null,
      }),
      affectedBy: {
        subscription: 'direct',
      },
    })

    const affected = getSyncablesAffectedBy('subscription')

    expect(affected).toHaveLength(2)
    const syncTypes = affected.map((a) => a.syncType).sort()
    expect(syncTypes).toEqual([
      'customerSubscriptions',
      'subscription',
    ])
  })

  it('returns empty array for unregistered invalidation type', () => {
    syncable('customerSubscriptions', {
      resolver: async ({
        input: _input,
      }: {
        input: { customerId: string }
        ctx: unknown
      }) => ({
        data: [],
      }),
      affectedBy: {
        customerSubscriptions: 'direct',
      },
    })

    // Cast to any since 'unknownType' is not a valid DependencyType
    const affected = getSyncablesAffectedBy(
      'unknownType' as 'customerSubscriptions'
    )
    expect(affected).toHaveLength(0)
  })

  it('returns empty array when registry is empty', () => {
    const affected = getSyncablesAffectedBy('subscription')
    expect(affected).toHaveLength(0)
  })

  it('returns direct marker as affectedByFn when mapping is direct', () => {
    syncable('customerSubscriptions', {
      resolver: async ({
        input: _input,
      }: {
        input: { customerId: string }
        ctx: unknown
      }) => ({
        data: [],
      }),
      affectedBy: {
        customerSubscriptions: 'direct',
      },
    })

    const affected = getSyncablesAffectedBy('customerSubscriptions')
    expect(affected).toHaveLength(1)
    expect(affected[0].affectedByFn).toBe('direct')
  })
})

describe('isSyncTypeRegistered', () => {
  beforeEach(() => {
    syncableRegistry.clear()
  })

  it('returns true for registered sync types', () => {
    syncable('customerSubscriptions', {
      resolver: async ({
        input: _input,
      }: {
        input: { customerId: string }
        ctx: unknown
      }) => ({}),
      affectedBy: {},
    })

    expect(isSyncTypeRegistered('customerSubscriptions')).toBe(true)
  })

  it('returns false for unregistered sync types', () => {
    expect(isSyncTypeRegistered('customerSubscriptions')).toBe(false)
    expect(isSyncTypeRegistered('subscription')).toBe(false)
  })
})

describe('getSyncableConfig', () => {
  beforeEach(() => {
    syncableRegistry.clear()
  })

  it('returns the registry entry for a registered sync type', () => {
    const resolver = async ({
      input: _input,
    }: {
      input: { customerId: string }
      ctx: unknown
    }) => ({
      data: [],
    })
    const affectedByFn = async ({
      payload: _payload,
    }: {
      payload: { subscriptionId: string }
      ctx: unknown
    }) => ({
      customerId: 'derived',
    })

    syncable('customerSubscriptions', {
      resolver,
      affectedBy: {
        customerSubscriptions: 'direct',
        subscription: affectedByFn,
      },
    })

    const config = getSyncableConfig('customerSubscriptions')

    expect(config?.affectedBy.customerSubscriptions).toBe('direct')
    expect(typeof config?.affectedBy.subscription).toBe('function')
    expect(typeof config?.resolver).toBe('function')
  })

  it('returns undefined for unregistered sync type', () => {
    const config = getSyncableConfig('customerSubscriptions')
    expect(config).toBeUndefined()
  })
})

describe('affectedBy function execution', () => {
  beforeEach(() => {
    syncableRegistry.clear()
  })

  it('affectedBy function receives payload and ctx and returns derived input', async () => {
    let capturedPayload: unknown
    let capturedCtx: unknown

    syncable('customerSubscriptions', {
      resolver: async ({
        input: _input,
      }: {
        input: { customerId: string }
        ctx: unknown
      }) => ({
        data: [],
      }),
      affectedBy: {
        subscription: async ({ payload, ctx }) => {
          capturedPayload = payload
          capturedCtx = ctx
          return { customerId: 'derived_customer' }
        },
      },
    })

    const affected = getSyncablesAffectedBy('subscription')
    const affectedByFn = affected[0].affectedByFn

    // Ensure it's a function (not 'direct')
    expect(typeof affectedByFn).toBe('function')
    if (typeof affectedByFn === 'function') {
      const testPayload = { subscriptionId: 'sub_123' }
      const testCtx = { userId: 'user_456', transaction: {} }

      const result = await affectedByFn({
        payload: testPayload,
        ctx: testCtx,
      })

      expect(capturedPayload).toEqual(testPayload)
      expect(capturedCtx).toEqual(testCtx)
      expect(result).toEqual({ customerId: 'derived_customer' })
    }
  })

  it('affectedBy function can return array for fan-out', async () => {
    syncable('customerSubscriptions', {
      resolver: async ({
        input: _input,
      }: {
        input: { customerId: string }
        ctx: unknown
      }) => ({
        data: [],
      }),
      affectedBy: {
        subscription: async ({ payload: _payload }) => {
          // Fan-out: single subscription affects multiple customers
          return [
            { customerId: 'cust_1' },
            { customerId: 'cust_2' },
            { customerId: 'cust_3' },
          ]
        },
      },
    })

    const affected = getSyncablesAffectedBy('subscription')
    const affectedByFn = affected[0].affectedByFn

    expect(typeof affectedByFn).toBe('function')
    if (typeof affectedByFn === 'function') {
      const result = await affectedByFn({
        payload: { subscriptionId: 'sub_123' },
        ctx: {},
      })

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(3)
      expect(result).toEqual([
        { customerId: 'cust_1' },
        { customerId: 'cust_2' },
        { customerId: 'cust_3' },
      ])
    }
  })
})

// TYPE TEST: The following would cause TypeScript errors if uncommented,
// demonstrating the type safety of the affectedBy function return type.
//
// syncable('customerSubscriptions', {
//   resolver: async ({ input }) => {},
//   affectedBy: {
//     subscription: async ({ payload }) => ({ subscriptionId: '123' })
//     // ERROR: Type '{ subscriptionId: string; }' is not assignable to
//     // type 'SyncPayload<"customerSubscriptions">' (which is { customerId: string })
//   }
// })
