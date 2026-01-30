import { beforeEach, describe, expect, it } from 'bun:test'
import type { Organization } from '@db-core/schema/organizations'
import { Result } from 'better-result'
import { setupOrg } from '@/../seedDatabase'
import {
  adminTransactionUnwrap,
  adminTransactionWithResult,
  comprehensiveAdminTransactionWithResult,
} from './adminTransaction'
import { selectOrganizations } from './tableMethods/organizationMethods'

describe('comprehensiveAdminTransactionWithResult', () => {
  it('propagates errors from transaction callback', async () => {
    await expect(
      comprehensiveAdminTransactionWithResult(async () => {
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

describe('adminTransactionWithResult', () => {
  let testOrg: Organization.Record

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    testOrg = orgSetup.organization
  })

  it('returns Result.ok on successful transaction', async () => {
    // setup:
    // - call adminTransactionWithResult with a function that returns Result.ok
    // expects:
    // - the result should be Result.ok with the value
    const result = await adminTransactionWithResult(
      async ({ transaction }) => {
        const orgs = await selectOrganizations({}, transaction)
        const foundOrg = orgs.find((o) => o.id === testOrg.id)
        return Result.ok({ found: !!foundOrg, count: orgs.length })
      },
      { livemode: true }
    )

    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.found).toBe(true)
      expect(result.value.count).toBeGreaterThanOrEqual(1)
    }
  })

  it('returns Result.err when callback returns Result.err (does not throw)', async () => {
    // setup:
    // - call adminTransactionWithResult with a function that returns Result.err
    // expects:
    // - the result should be Result.err with the error (not thrown)
    const errorMessage =
      'Admin validation failed: business rule violated'

    const result = await adminTransactionWithResult(
      async () => Result.err(new Error(errorMessage)),
      { livemode: true }
    )

    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(result.error.message).toBe(errorMessage)
    }
  })

  it('returns Result.err when callback throws directly', async () => {
    // setup:
    // - throw an error directly inside the callback
    // expects:
    // - the result should be Result.err with the error (not thrown to caller)
    const directErrorMessage = 'Direct throw converted to Result.err'

    const result = await adminTransactionWithResult(
      async () => {
        throw new Error(directErrorMessage)
      },
      { livemode: true }
    )

    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(result.error.message).toBe(directErrorMessage)
    }
  })

  it('provides ComprehensiveAdminTransactionParams with all required callbacks', async () => {
    // setup:
    // - verify the params have all expected properties
    // expects:
    // - params should have transaction, invalidateCache, emitEvent, enqueueLedgerCommand
    const result = await adminTransactionWithResult(
      async (params) => {
        expect(typeof params.transaction.execute).toBe('function')
        expect(typeof params.invalidateCache).toBe('function')
        expect(typeof params.emitEvent).toBe('function')
        expect(typeof params.enqueueLedgerCommand).toBe('function')
        expect(params.userId).toBe('ADMIN')
        expect(typeof params.livemode).toBe('boolean')
        return Result.ok('params_verified')
      },
      { livemode: true }
    )

    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value).toBe('params_verified')
    }
  })

  it('respects livemode option', async () => {
    // setup:
    // - call with livemode: false
    // expects:
    // - transaction should complete successfully with test mode context
    const result = await adminTransactionWithResult(
      async (params) => {
        expect(params.livemode).toBe(false)
        return Result.ok('testmode_success')
      },
      { livemode: false }
    )

    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value).toBe('testmode_success')
    }
  })

  it('can be unwrapped at the caller level', async () => {
    // setup:
    // - call adminTransactionWithResult and then unwrap the result
    // expects:
    // - unwrap should return the value directly on success
    const result = await adminTransactionWithResult(
      async () => Result.ok('unwrap_test'),
      { livemode: true }
    )

    const value = result.unwrap()
    expect(value).toBe('unwrap_test')
  })

  it('unwrap throws when result is an error', async () => {
    // setup:
    // - call adminTransactionWithResult with Result.err and then try to unwrap
    // expects:
    // - unwrap should throw the error
    const errorMessage = 'Error to be thrown by unwrap'

    const result = await adminTransactionWithResult(
      async () => Result.err(new Error(errorMessage)),
      { livemode: true }
    )

    expect(() => result.unwrap()).toThrow(errorMessage)
  })
})
