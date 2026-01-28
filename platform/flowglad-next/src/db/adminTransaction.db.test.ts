import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import { setupOrg } from '@/../seedDatabase'
import {
  adminTransaction,
  adminTransactionUnwrap,
} from './adminTransaction'
import type { Organization } from './schema/organizations'
import { selectOrganizations } from './tableMethods/organizationMethods'

describe('adminTransaction', () => {
  it('propagates errors from transaction callback', async () => {
    await expect(
      adminTransaction(async () => {
        throw new Error('Admin transaction rolled back')
      })
    ).rejects.toThrow('Admin transaction rolled back')
  })
})

describe('adminTransactionUnwrap', () => {
  let testOrg: Organization.Record

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    testOrg = orgSetup.organization
  })

  it('unwraps a successful Result and returns the value', async () => {
    // setup:
    // - call adminTransactionUnwrap with a function that returns Result.ok
    // expects:
    // - the unwrapped value should be returned directly
    const result = await adminTransactionUnwrap(
      async (ctx) => {
        const { transaction } = ctx
        const orgs = await selectOrganizations({}, transaction)
        const foundOrg = orgs.find((o) => o.id === testOrg.id)
        return Result.ok({ found: !!foundOrg, count: orgs.length })
      },
      { livemode: true }
    )

    expect(result.found).toBe(true)
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it('throws when Result contains an error, preserving the original error message', async () => {
    // setup:
    // - call adminTransactionUnwrap with a function that returns Result.err
    // expects:
    // - the error should be thrown with the original message preserved
    const errorMessage =
      'Admin validation failed: insufficient permissions'

    await expect(
      adminTransactionUnwrap(
        async () => Result.err(new Error(errorMessage)),
        { livemode: true }
      )
    ).rejects.toThrow(errorMessage)
  })

  it('provides TransactionEffectsContext with all required callbacks', async () => {
    // setup:
    // - verify the ctx parameter has all expected properties
    // expects:
    // - ctx should have transaction, invalidateCache, emitEvent, enqueueLedgerCommand
    const result = await adminTransactionUnwrap(
      async (ctx) => {
        expect(typeof ctx.transaction.execute).toBe('function')
        expect(typeof ctx.invalidateCache).toBe('function')
        expect(typeof ctx.emitEvent).toBe('function')
        expect(typeof ctx.enqueueLedgerCommand).toBe('function')
        return Result.ok('admin_context_verified')
      },
      { livemode: true }
    )

    expect(result).toBe('admin_context_verified')
  })

  it('propagates errors thrown inside the callback (not wrapped in Result)', async () => {
    // setup:
    // - throw an error directly inside the callback
    // expects:
    // - the error should be propagated
    const directErrorMessage = 'Direct admin throw error'

    await expect(
      adminTransactionUnwrap(
        async () => {
          throw new Error(directErrorMessage)
        },
        { livemode: true }
      )
    ).rejects.toThrow(directErrorMessage)
  })

  it('respects livemode option', async () => {
    // setup:
    // - call with livemode: false
    // expects:
    // - transaction should complete successfully with test mode context
    const result = await adminTransactionUnwrap(
      async () => Result.ok('testmode_success'),
      { livemode: false }
    )

    expect(result).toBe('testmode_success')
  })
})
