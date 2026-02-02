import { beforeEach, describe, expect, it } from 'bun:test'
import {
  EventNoun,
  FlowgladEventType,
  MembershipRole,
} from '@db-core/enums'
import type { ApiKey } from '@db-core/schema/apiKeys'
import type { Event } from '@db-core/schema/events'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { User } from '@db-core/schema/users'
import { Result } from 'better-result'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  setupMemberships,
  setupOrg,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { hashData } from '@/utils/backendCore'
import core from '@/utils/core'
import { adminTransaction } from './adminTransaction'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
  authenticatedTransactionUnwrap,
  authenticatedTransactionWithResult,
  comprehensiveAuthenticatedTransaction,
} from './authenticatedTransaction'
import {
  insertMembership,
  selectMemberships,
} from './tableMethods/membershipMethods'
import { selectOrganizations } from './tableMethods/organizationMethods'
import { insertUser } from './tableMethods/userMethods'
import type { DbTransaction } from './types'

// Note: @/utils/auth is mocked globally in bun.setup.ts
// Tests can set globalThis.__mockedAuthSession to configure the session

const currentOrganizationIdQueryResultSchema = z
  .object({ organization_id: z.string() })
  .array()

/**
 * Read `current_organization_id()` inside an authenticated transaction.
 * This is used to ensure authenticatedTransaction correctly sets the request
 * context for RLS policies that depend on it.
 */
const selectCurrentOrganizationId = async (
  transaction: DbTransaction
): Promise<string> => {
  const rows = await transaction.execute(
    sql`select current_organization_id() as organization_id`
  )
  const [row] = currentOrganizationIdQueryResultSchema.parse(rows)
  if (!row) {
    throw new Error('Expected at least one row for current org query')
  }
  return row.organization_id
}

describe('authenticatedTransaction', () => {
  // Global test state variables
  let testOrg1: Organization.Record
  let testOrg2: Organization.Record
  let pricingModel1: PricingModel.Record // livemode PM for testOrg1
  let pricingModel2: PricingModel.Record // livemode PM for testOrg2
  let userA: User.Record
  let userB: User.Record
  let apiKeyA: ApiKey.Record
  let apiKeyB: ApiKey.Record
  let membershipA1: Membership.Record // userA in testOrg1
  let membershipA2: Membership.Record // userA in testOrg2
  let membershipB2: Membership.Record // userB in testOrg2

  beforeEach(async () => {
    globalThis.__mockedAuthSession = null

    // Setup two test organizations
    const org1Setup = await setupOrg()
    testOrg1 = org1Setup.organization
    pricingModel1 = org1Setup.pricingModel

    const org2Setup = await setupOrg()
    testOrg2 = org2Setup.organization
    pricingModel2 = org2Setup.pricingModel

    // Setup users and API keys for each organization
    const userApiKeyA = await setupUserAndApiKey({
      organizationId: testOrg1.id,
      livemode: true,
    })
    userA = userApiKeyA.user
    apiKeyA = userApiKeyA.apiKey

    const userApiKeyB = await setupUserAndApiKey({
      organizationId: testOrg2.id,
      livemode: true,
    })
    userB = userApiKeyB.user
    apiKeyB = userApiKeyB.apiKey

    // Get the membership that was created by setupUserAndApiKey for userA
    // Note: setupUserAndApiKey already creates a membership, so we just need to retrieve it
    membershipA1 = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const [membership] = await selectMemberships(
        { userId: userA.id, organizationId: testOrg1.id },
        transaction
      )
      if (!membership) {
        throw new Error('Failed to find membershipA1')
      }
      return membership
    })

    // Create additional membership for userA in testOrg2 (focused: false)
    membershipA2 = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return insertMembership(
        {
          organizationId: testOrg2.id,
          userId: userA.id,
          focused: false,
          livemode: true,
          role: MembershipRole.Member,
          focusedPricingModelId: pricingModel2.id,
        },
        transaction
      )
    })

    // Get the membership that was created by setupUserAndApiKey for userB
    membershipB2 = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const [membership] = await selectMemberships(
        { userId: userB.id, organizationId: testOrg2.id },
        transaction
      )
      if (!membership) {
        throw new Error('Failed to find membershipB2')
      }
      return membership
    })
  })

  describe('JWT Claims Validation', () => {
    it('should throw error when invalid API key is provided', async () => {
      // setup:
      // - call authenticatedTransaction with invalid/empty API key
      // - provide simple transaction function that should not execute

      // expects:
      // - function should throw authentication error
      // - no database transaction should be started
      await expect(
        authenticatedTransaction(
          async () => 'should not reach here',
          { apiKey: 'invalid_key_that_does_not_exist' }
        )
      ).rejects.toThrow()
    })

    it('should work with valid API key authentication', async () => {
      // setup:
      // - use valid API key from testOrg1 setup
      // - provide simple transaction function that returns success

      // expects:
      // - transaction should execute successfully with proper context
      const result = await authenticatedTransaction(
        async ({ transaction, userId, organizationId }) => {
          expect(userId).toBe(userA.id)
          expect(organizationId).toBe(testOrg1.id)
          return 'success'
        },
        { apiKey: apiKeyA.token }
      )
      expect(result).toBe('success')
    })
  })

  describe('Database Configuration Setup', () => {
    it('should properly set database context for live mode', async () => {
      // setup:
      // - use valid API key from testOrg1 setup (livemode: true)
      // - verify database context is set correctly

      // expects:
      // - transaction should execute successfully with livemode: true
      const result = await authenticatedTransaction(
        async ({ livemode, organizationId }) => {
          expect(livemode).toBe(true)
          expect(organizationId).toBe(testOrg1.id)
          return 'livemode_success'
        },
        { apiKey: apiKeyA.token }
      )
      expect(result).toBe('livemode_success')
    })

    it('should set livemode configuration correctly for test mode', async () => {
      // setup:
      // - create API key for test mode (livemode: false)
      // - verify livemode context is set correctly

      // expects:
      // - livemode should be false in transaction params
      const testModeApiKey = await setupUserAndApiKey({
        organizationId: testOrg1.id,
        livemode: false,
      })

      const result = await authenticatedTransaction(
        async ({ livemode }) => {
          expect(livemode).toBe(false)
          return 'test_mode_success'
        },
        { apiKey: testModeApiKey.apiKey.token }
      )
      expect(result).toBe('test_mode_success')
    })

    it('should handle transaction function errors gracefully', async () => {
      // setup:
      // - use valid API key
      // - provide transaction function that throws an error

      // expects:
      // - original error should be propagated
      // - database should not be left in dirty state
      await expect(
        authenticatedTransaction(
          async () => {
            throw new Error('Transaction function error')
          },
          { apiKey: apiKeyA.token }
        )
      ).rejects.toThrow('Transaction function error')
    })
  })

  describe('current_organization_id()', () => {
    it('is set for API key authenticated requests', async () => {
      const result = await authenticatedTransaction(
        async (ctx) => {
          const { transaction, organizationId } = ctx
          const currentOrganizationId =
            await selectCurrentOrganizationId(transaction)
          expect(currentOrganizationId).toBe(organizationId)
          return currentOrganizationId
        },
        { apiKey: apiKeyA.token }
      )
      expect(result).toBe(testOrg1.id)
    })

    it('is set for webapp authenticated requests', async () => {
      const betterAuthId = `bau_test_${hashData(
        `betterAuth-${Date.now()}`
      )}`
      const email = `webapp-${Date.now()}@test.com`
      const userId = `usr_test_${hashData(`user-${Date.now()}`)}`

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await insertUser(
          {
            id: userId,
            email,
            name: 'Webapp User',
            betterAuthId,
          },
          transaction
        )
        await insertMembership(
          {
            organizationId: testOrg1.id,
            userId,
            focused: true,
            livemode: true,
            role: MembershipRole.Member,
            focusedPricingModelId: pricingModel1.id,
          },
          transaction
        )
        await insertMembership(
          {
            organizationId: testOrg2.id,
            userId,
            focused: false,
            livemode: true,
            role: MembershipRole.Member,
            focusedPricingModelId: pricingModel2.id,
          },
          transaction
        )
      })

      globalThis.__mockedAuthSession = {
        user: {
          id: betterAuthId,
          email,
        },
      }

      const result = await authenticatedTransaction(async (ctx) => {
        const { transaction, organizationId } = ctx
        const currentOrganizationId =
          await selectCurrentOrganizationId(transaction)
        expect(currentOrganizationId).toBe(organizationId)
        return currentOrganizationId
      })

      expect(result).toBe(testOrg1.id)
    })
  })
})

describe('comprehensiveAuthenticatedTransaction', () => {
  // Reuse the same global test state
  let testOrg1: Organization.Record
  let testOrg2: Organization.Record
  let userA: User.Record
  let apiKeyA: ApiKey.Record
  let pricingModel1: PricingModel.Record

  beforeEach(async () => {
    // Setup test organizations and users
    const org1Setup = await setupOrg()
    testOrg1 = org1Setup.organization
    pricingModel1 = org1Setup.pricingModel

    const org2Setup = await setupOrg()
    testOrg2 = org2Setup.organization

    const userApiKeyA = await setupUserAndApiKey({
      organizationId: testOrg1.id,
      livemode: true,
    })
    userA = userApiKeyA.user
    apiKeyA = userApiKeyA.apiKey
  })

  describe('JWT Claims Validation', () => {
    it('should throw error when invalid API key is provided', async () => {
      // setup:
      // - call comprehensiveAuthenticatedTransaction with invalid API key
      // - provide transaction function that should not execute

      // expects:
      // - function should throw authentication error
      // - no database transaction should be started
      await expect(
        comprehensiveAuthenticatedTransaction(
          async () => Result.ok('should not reach here'),
          { apiKey: 'invalid_key_that_does_not_exist' }
        )
      ).rejects.toThrow()
    })

    it('should work with valid organization_id in JWT claims', async () => {
      // setup:
      // - use valid API key with proper organization_id
      // - provide transaction function that returns TransactionOutput

      // expects:
      // - function should execute successfully
      // - organizationId should be available in transaction params
      const result = await comprehensiveAuthenticatedTransaction(
        async ({ organizationId, userId }) => {
          expect(organizationId).toBe(testOrg1.id)
          expect(userId).toBe(userA.id)
          return Result.ok('comprehensive_success')
        },
        { apiKey: apiKeyA.token }
      )
      expect(result).toBe('comprehensive_success')
    })
  })

  describe('Transaction Output Processing', () => {
    it('should process events emitted via callback', async () => {
      // setup:
      // - use valid API key
      // - create transaction function that emits events via emitEvent callback

      // expects:
      // - events should be processed
      // - transaction should complete successfully
      // - result should be returned from output.result
      const mockEvent: Event.Insert = {
        type: FlowgladEventType.PaymentSucceeded,
        livemode: true,
        payload: {
          object: EventNoun.Payment,
          id: 'test_event_1',
          customer: {
            id: 'test_customer_id',
            externalId: 'test_external_id',
          },
        },
        organizationId: testOrg1.id,
        metadata: {},
        hash: hashData(testOrg1.id),
        occurredAt: Date.now(),
        submittedAt: Date.now(),
        processedAt: null,
        pricingModelId: pricingModel1.id,
      }

      const result = await comprehensiveAuthenticatedTransaction(
        async ({ emitEvent }) => {
          emitEvent(mockEvent)
          return Result.ok('events_processed')
        },
        { apiKey: apiKeyA.token }
      )
      expect(result).toBe('events_processed')
    })

    it('should handle transaction output with no additional processing', async () => {
      // setup:
      // - use valid API key
      // - create transaction function that returns simple TransactionOutput

      // expects:
      // - transaction should complete successfully
      // - result should be returned from output.result
      const result = await comprehensiveAuthenticatedTransaction(
        async () => Result.ok('simple_result'),
        { apiKey: apiKeyA.token }
      )
      expect(result).toBe('simple_result')
    })
  })
})

describe('Authentication Method Tests', () => {
  let testOrg1: Organization.Record
  let userA: User.Record
  let apiKeyA: ApiKey.Record

  beforeEach(async () => {
    const org1Setup = await setupOrg()
    testOrg1 = org1Setup.organization

    const userApiKeyA = await setupUserAndApiKey({
      organizationId: testOrg1.id,
      livemode: true,
    })
    userA = userApiKeyA.user
    apiKeyA = userApiKeyA.apiKey
  })

  describe('API Key Authentication', () => {
    it('should work with valid API key authentication', async () => {
      // setup:
      // - use valid API key from testOrg1
      // - provide transaction function that calls selectOrganizations

      // expects:
      // - transaction should execute successfully
      // - JWT claims should be properly set for API key user
      // - selectOrganizations should return testOrg1
      const result = await authenticatedTransaction(
        async ({ transaction, userId, organizationId }) => {
          expect(userId).toBe(userA.id)
          expect(organizationId).toBe(testOrg1.id)

          const organizations = await selectOrganizations(
            {},
            transaction
          )
          return organizations
        },
        { apiKey: apiKeyA.token }
      )

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(testOrg1.id)
    })

    it('should create proper JWT claims for API key users', async () => {
      // setup:
      // - use valid API key from testOrg1
      // - verify transaction parameters contain correct values

      // expects:
      // - JWT claims should contain correct userId from API key metadata
      // - JWT claims should contain correct organization_id from API key
      // - livemode should match API key settings
      const result = await authenticatedTransaction(
        async ({ userId, organizationId, livemode }) => {
          expect(userId).toBe(userA.id)
          expect(organizationId).toBe(testOrg1.id)
          expect(livemode).toBe(apiKeyA.livemode)
          return 'api_key_jwt_success'
        },
        { apiKey: apiKeyA.token }
      )

      expect(result).toBe('api_key_jwt_success')
    })
  })
})

describe('Error Handling Tests', () => {
  let testOrg1: Organization.Record
  let apiKeyA: ApiKey.Record

  beforeEach(async () => {
    const org1Setup = await setupOrg()
    testOrg1 = org1Setup.organization

    const userApiKeyA = await setupUserAndApiKey({
      organizationId: testOrg1.id,
      livemode: true,
    })
    apiKeyA = userApiKeyA.apiKey
  })

  describe('Test-Only Organization ID Validation', () => {
    it('throws error when __testOnlyOrganizationId is used in non-test environment', async () => {
      const originalIsTest = core.IS_TEST
      // Temporarily override IS_TEST to simulate non-test environment
      Object.defineProperty(core, 'IS_TEST', {
        value: false,
        writable: true,
        configurable: true,
      })

      try {
        await expect(
          authenticatedTransaction(
            async () => 'should not reach here',
            { __testOnlyOrganizationId: testOrg1.id }
          )
        ).rejects.toThrow(
          'Attempted to use test organization id in a non-test environment'
        )

        // Also verify comprehensiveAuthenticatedTransaction has the same check
        await expect(
          comprehensiveAuthenticatedTransaction(
            async () => Result.ok('should not reach here'),
            { __testOnlyOrganizationId: testOrg1.id }
          )
        ).rejects.toThrow(
          'Attempted to use test organization id in a non-test environment'
        )
      } finally {
        // Restore original IS_TEST value
        Object.defineProperty(core, 'IS_TEST', {
          value: originalIsTest,
          writable: true,
          configurable: true,
        })
      }
    })

    it('allows __testOnlyOrganizationId in test environment (validation passes before auth fails)', async () => {
      // This test runs in test environment where IS_TEST is true
      // The __testOnlyOrganizationId validation should pass, but downstream auth
      // will fail with various errors depending on session state.
      // The key assertion is that we do NOT get the "non-test environment" error.
      const testOnlyError =
        'Attempted to use test organization id in a non-test environment'

      try {
        await authenticatedTransaction(async () => 'result', {
          __testOnlyOrganizationId: testOrg1.id,
        })
        // If we reach here, transaction succeeded - that's fine too
      } catch (error) {
        // We should NOT get the test-only validation error
        expect((error as Error).message).not.toBe(testOnlyError)
      }
    })
  })

  describe('Authentication Failures', () => {
    it('should handle invalid API key gracefully', async () => {
      // setup:
      // - provide invalid API key that doesn't exist in database
      // - provide simple transaction function

      // expects:
      // - authentication error should be propagated
      // - no database transaction should be started
      // - no database state should be left dirty
      await expect(
        authenticatedTransaction(
          async () => 'should not reach here',
          { apiKey: 'completely_invalid_key_12345' }
        )
      ).rejects.toThrow()
    })
  })

  describe('Database Transaction Failures', () => {
    it('should handle transaction function errors gracefully', async () => {
      // setup:
      // - use valid API key
      // - provide transaction function that throws error after some operations

      // expects:
      // - original error from transaction function should be propagated
      // - database should not be left in dirty state due to transaction rollback
      await expect(
        authenticatedTransaction(
          async (ctx) => {
            const { transaction } = ctx
            // Perform some database operation first
            await selectOrganizations({}, transaction)
            // Then throw error
            throw new Error('Intentional transaction error')
          },
          { apiKey: apiKeyA.token }
        )
      ).rejects.toThrow('Intentional transaction error')
    })
  })
})

describe('Procedure Wrapper Functions', () => {
  let testOrg1: Organization.Record
  let apiKeyA: ApiKey.Record

  beforeEach(async () => {
    const org1Setup = await setupOrg()
    testOrg1 = org1Setup.organization

    const userApiKeyA = await setupUserAndApiKey({
      organizationId: testOrg1.id,
      livemode: true,
    })
    apiKeyA = userApiKeyA.apiKey
  })

  describe('authenticatedProcedureTransaction', () => {
    it('should pass input and context to handler function', async () => {
      // setup:
      // - create test input object and context with apiKey
      // - create handler function that returns test result

      // expects:
      // - handler should be called with transaction params plus input and ctx
      // - result from handler should be returned
      // - apiKey from context should be passed to authenticatedTransaction
      const testInput = { testValue: 'input_test' }
      const testContext = { apiKey: apiKeyA.token }

      const procedureHandler = authenticatedProcedureTransaction(
        async ({ input, ctx, transactionCtx }) => {
          const { transaction } = transactionCtx
          expect(input).toEqual(testInput)
          expect(ctx).toEqual(testContext)

          // Verify we can use transaction
          const organizations = await selectOrganizations(
            {},
            transaction
          )
          expect(organizations).toHaveLength(1)

          return 'procedure_success'
        }
      )

      const result = await procedureHandler({
        input: testInput,
        ctx: testContext,
      })

      expect(result).toBe('procedure_success')
    })
  })

  describe('authenticatedProcedureComprehensiveTransaction', () => {
    it('should pass input and context to handler function', async () => {
      // setup:
      // - create test input object and context with apiKey
      // - create handler function that returns TransactionOutput

      // expects:
      // - handler should be called with transaction params plus input and ctx
      // - result from output.result should be returned
      // - apiKey from context should be passed to comprehensiveAuthenticatedTransaction
      const testInput = { testValue: 'comprehensive_input_test' }
      const testContext = { apiKey: apiKeyA.token }

      const procedureHandler =
        authenticatedProcedureComprehensiveTransaction(
          async ({ input, ctx, transactionCtx }) => {
            expect(input).toEqual(testInput)
            expect(ctx).toEqual(testContext)
            // Verify transactionCtx has expected properties
            expect(typeof transactionCtx.transaction.execute).toBe(
              'function'
            )
            expect(typeof transactionCtx.invalidateCache).toBe(
              'function'
            )
            expect(typeof transactionCtx.emitEvent).toBe('function')
            expect(typeof transactionCtx.enqueueLedgerCommand).toBe(
              'function'
            )

            return Result.ok('comprehensive_procedure_success')
          }
        )

      const result = await procedureHandler({
        input: testInput,
        ctx: testContext,
      })

      expect(result).toBe('comprehensive_procedure_success')
    })
  })
})

describe('Edge Cases', () => {
  let testOrg1: Organization.Record
  let apiKeyA: ApiKey.Record

  beforeEach(async () => {
    const org1Setup = await setupOrg()
    testOrg1 = org1Setup.organization

    const userApiKeyA = await setupUserAndApiKey({
      organizationId: testOrg1.id,
      livemode: true,
    })
    apiKeyA = userApiKeyA.apiKey
  })

  describe('Database Function Dependencies', () => {
    it('should document behavior with current RLS implementation', async () => {
      // setup:
      // - create test organizations and memberships
      // - attempt to call selectMemberships and selectOrganizations

      // expects:
      // - document current behavior (may include issues with missing current_organization_id function)
      // - this test should highlight any RLS policy issues
      // - may need to be updated once current_organization_id function is implemented
      const result = await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          try {
            const memberships = await selectMemberships(
              {},
              transaction
            )
            const organizations = await selectOrganizations(
              {},
              transaction
            )

            return {
              memberships: memberships.length,
              organizations: organizations.length,
              success: true,
            }
          } catch (error: any) {
            return {
              error: error.message,
              success: false,
            }
          }
        },
        { apiKey: apiKeyA.token }
      )

      // Document the current behavior - may succeed or fail depending on RLS implementation
      expect(result).toEqual(
        expect.objectContaining({
          success: expect.any(Boolean),
        })
      )
      if (result.success) {
        expect(result.memberships).toBeGreaterThanOrEqual(0)
        expect(result.organizations).toBeGreaterThanOrEqual(0)
      } else {
        expect(typeof result.error).toBe('string')
      }
    })
  })
})

// NOTE: cacheRecomputationContext derivation tests removed as part of
// wire-recomputation-to-event-push Patch 1. CacheRecomputationContext was
// simplified to just { livemode: boolean } - the type/customerId/organizationId/userId
// fields were only needed for cache recomputation, which has been removed.

describe('authenticatedTransactionUnwrap', () => {
  let testOrg: Organization.Record
  let apiKey: ApiKey.Record

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    testOrg = orgSetup.organization

    const userApiKey = await setupUserAndApiKey({
      organizationId: testOrg.id,
      livemode: true,
    })
    apiKey = userApiKey.apiKey
  })

  it('unwraps a successful Result and returns the value', async () => {
    // setup:
    // - use valid API key
    // - provide transaction function that returns Result.ok with a value
    // expects:
    // - the unwrapped value should be returned directly
    const result = await authenticatedTransactionUnwrap(
      async (ctx) => {
        const { transaction } = ctx
        const orgs = await selectOrganizations({}, transaction)
        return Result.ok({ count: orgs.length, success: true })
      },
      { apiKey: apiKey.token }
    )

    expect(result).toEqual({ count: 1, success: true })
  })

  it('throws when Result contains an error, preserving the original error message', async () => {
    // setup:
    // - use valid API key
    // - provide transaction function that returns Result.err with an error
    // expects:
    // - the error should be thrown
    // - the original error message should be preserved
    const errorMessage = 'Business logic validation failed'

    await expect(
      authenticatedTransactionUnwrap(
        async () => Result.err(new Error(errorMessage)),
        { apiKey: apiKey.token }
      )
    ).rejects.toThrow(errorMessage)
  })

  it('provides TransactionEffectsContext with all required callbacks', async () => {
    // setup:
    // - use valid API key
    // - verify ctx contains all expected properties
    // expects:
    // - ctx should have transaction, invalidateCache, emitEvent, enqueueLedgerCommand
    const result = await authenticatedTransactionUnwrap(
      async (ctx) => {
        expect(typeof ctx.transaction.execute).toBe('function')
        expect(typeof ctx.invalidateCache).toBe('function')
        expect(typeof ctx.emitEvent).toBe('function')
        expect(typeof ctx.enqueueLedgerCommand).toBe('function')
        return Result.ok('context_verified')
      },
      { apiKey: apiKey.token }
    )

    expect(result).toBe('context_verified')
  })

  it('propagates errors thrown inside the callback (not wrapped in Result)', async () => {
    // setup:
    // - use valid API key
    // - throw an error directly inside the callback (not via Result.err)
    // expects:
    // - the error should be propagated
    const directErrorMessage = 'Direct throw error'

    await expect(
      authenticatedTransactionUnwrap(
        async () => {
          throw new Error(directErrorMessage)
        },
        { apiKey: apiKey.token }
      )
    ).rejects.toThrow(directErrorMessage)
  })
})

describe('authenticatedTransactionWithResult', () => {
  let testOrg: Organization.Record
  let apiKey: ApiKey.Record

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    testOrg = orgSetup.organization

    const userApiKey = await setupUserAndApiKey({
      organizationId: testOrg.id,
      livemode: true,
    })
    apiKey = userApiKey.apiKey
  })

  it('returns Result.ok on successful transaction', async () => {
    // setup:
    // - use valid API key
    // - provide transaction function that returns Result.ok with a value
    // expects:
    // - the result should be Result.ok with the value
    const result = await authenticatedTransactionWithResult(
      async ({ transaction }) => {
        const orgs = await selectOrganizations({}, transaction)
        return Result.ok({ count: orgs.length, success: true })
      },
      { apiKey: apiKey.token }
    )

    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.count).toBe(1)
      expect(result.value.success).toBe(true)
    }
  })

  it('returns Result.err when callback returns Result.err (does not throw)', async () => {
    // setup:
    // - use valid API key
    // - provide transaction function that returns Result.err with an error
    // expects:
    // - the result should be Result.err with the error (not thrown)
    const errorMessage = 'Business logic validation failed'

    const result = await authenticatedTransactionWithResult(
      async () => Result.err(new Error(errorMessage)),
      { apiKey: apiKey.token }
    )

    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(result.error.message).toBe(errorMessage)
    }
  })

  it('returns Result.err when callback throws directly', async () => {
    // setup:
    // - use valid API key
    // - throw an error directly inside the callback (not via Result.err)
    // expects:
    // - the result should be Result.err with the error (not thrown to caller)
    const directErrorMessage = 'Direct throw converted to Result.err'

    const result = await authenticatedTransactionWithResult(
      async () => {
        throw new Error(directErrorMessage)
      },
      { apiKey: apiKey.token }
    )

    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(result.error.message).toBe(directErrorMessage)
    }
  })

  it('provides ComprehensiveAuthenticatedTransactionParams with all required callbacks', async () => {
    // setup:
    // - use valid API key
    // - verify params contains all expected properties
    // expects:
    // - params should have transaction, invalidateCache, emitEvent, enqueueLedgerCommand, organizationId
    const result = await authenticatedTransactionWithResult(
      async (params) => {
        expect(typeof params.transaction.execute).toBe('function')
        expect(typeof params.invalidateCache).toBe('function')
        expect(typeof params.emitEvent).toBe('function')
        expect(typeof params.enqueueLedgerCommand).toBe('function')
        expect(params.organizationId).toBe(testOrg.id)
        expect(typeof params.livemode).toBe('boolean')
        return Result.ok('params_verified')
      },
      { apiKey: apiKey.token }
    )

    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value).toBe('params_verified')
    }
  })

  it('can be unwrapped at the caller level', async () => {
    // setup:
    // - call authenticatedTransactionWithResult and then unwrap the result
    // expects:
    // - unwrap should return the value directly on success
    const result = await authenticatedTransactionWithResult(
      async () => Result.ok('unwrap_test'),
      { apiKey: apiKey.token }
    )

    const value = result.unwrap()
    expect(value).toBe('unwrap_test')
  })

  it('unwrap throws when result is an error', async () => {
    // setup:
    // - call authenticatedTransactionWithResult with Result.err and then try to unwrap
    // expects:
    // - unwrap should throw the error
    const errorMessage = 'Error to be thrown by unwrap'

    const result = await authenticatedTransactionWithResult(
      async () => Result.err(new Error(errorMessage)),
      { apiKey: apiKey.token }
    )

    expect(() => result.unwrap()).toThrow(errorMessage)
  })
})
