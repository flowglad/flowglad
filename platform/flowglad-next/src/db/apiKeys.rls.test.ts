/**
 * API Key RLS Tests
 *
 * These tests verify that API key authentication works correctly regardless of
 * membership focused state, while ensuring proper cross-organization isolation.
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import {
  DiscountAmountType,
  DiscountDuration,
  FlowgladApiKeyType,
  MembershipRole,
} from '@db-core/enums'
import type { ApiKey } from '@db-core/schema/apiKeys'
import type { Customer } from '@db-core/schema/customers'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { User } from '@db-core/schema/users'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupProduct,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  deleteApiKey,
  insertApiKey,
  selectApiKeys,
} from '@/db/tableMethods/apiKeyMethods'
import {
  selectCustomerById,
  selectCustomers,
} from '@/db/tableMethods/customerMethods'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import {
  insertMembership,
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'
import { insertPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { customersRouter } from '@/server/routers/customersRouter'
import { discountsRouter } from '@/server/routers/discountsRouter'
import type { TRPCApiContext } from '@/server/trpcContext'
import { deleteSecretApiKeyTransaction } from '@/utils/apiKeyHelpers'
import { hashData } from '@/utils/backendCore'
import core from '@/utils/core'

describe('API Key RLS', () => {
  // Test state
  let orgA: Organization.Record
  let orgB: Organization.Record
  let orgAPricingModelIdLive: string
  let orgAPricingModelIdTest: string
  let orgBPricingModelIdLive: string
  let orgBPricingModelIdTest: string
  let userA: User.Record
  let apiKeyOrgA: ApiKey.Record & { token: string }
  let apiKeyOrgB: ApiKey.Record & { token: string }
  let membershipA_OrgA: Membership.Record // userA in orgA (will be unfocused)
  let membershipA_OrgB: Membership.Record // userA in orgB (focused)
  let customerInOrgA: Customer.Record
  let customerInOrgB: Customer.Record
  let productInOrgA: Product.Record
  let productInOrgB: Product.Record

  beforeEach(async () => {
    // Setup two organizations
    const orgASetup = await setupOrg()
    orgA = orgASetup.organization
    orgAPricingModelIdLive = orgASetup.pricingModel.id
    orgAPricingModelIdTest = orgASetup.testmodePricingModel.id
    // Create testmode products for testing with testmode API keys
    productInOrgA = await setupProduct({
      organizationId: orgA.id,
      name: 'Test Product A',
      livemode: false, // testmode to match API keys
      pricingModelId: orgASetup.testmodePricingModel.id,
      active: true,
    })

    const orgBSetup = await setupOrg()
    orgB = orgBSetup.organization
    orgBPricingModelIdLive = orgBSetup.pricingModel.id
    orgBPricingModelIdTest = orgBSetup.testmodePricingModel.id
    productInOrgB = await setupProduct({
      organizationId: orgB.id,
      name: 'Test Product B',
      livemode: false, // testmode to match API keys
      pricingModelId: orgBSetup.testmodePricingModel.id,
      active: true,
    })

    // Setup user with API key in orgA
    const userApiKeyA = await setupUserAndApiKey({
      organizationId: orgA.id,
      livemode: false, // Use testmode for tests
    })
    userA = userApiKeyA.user
    apiKeyOrgA = userApiKeyA.apiKey

    // Get the membership that was created by setupUserAndApiKey
    membershipA_OrgA = (
      await adminTransaction(async ({ transaction }) => {
        const [membership] = await selectMemberships(
          { userId: userA.id, organizationId: orgA.id },
          transaction
        )
        return Result.ok(await membership)
      })
    ).unwrap()

    // Create another API key for orgB (different user)
    const userApiKeyB = await setupUserAndApiKey({
      organizationId: orgB.id,
      livemode: false,
    })
    apiKeyOrgB = userApiKeyB.apiKey

    // Add userA to orgB with focused = true (simulating user switched to orgB)
    membershipA_OrgB = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await insertMembership(
            {
              organizationId: orgB.id,
              userId: userA.id,
              focused: true,
              livemode: false,
              role: MembershipRole.Member,
              focusedPricingModelId: orgBPricingModelIdTest,
            },
            transaction
          )
        )
      })
    ).unwrap()

    // Update userA's membership in orgA to be unfocused
    ;(
      await adminTransaction(async ({ transaction }) => {
        await updateMembership(
          {
            ...membershipA_OrgA,
            focused: false,
          },
          transaction
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    // Refresh membershipA_OrgA after update
    membershipA_OrgA = (
      await adminTransaction(async ({ transaction }) => {
        const [membership] = await selectMemberships(
          { userId: userA.id, organizationId: orgA.id },
          transaction
        )
        return Result.ok(await membership)
      })
    ).unwrap()

    // Create customers in each org
    customerInOrgA = await setupCustomer({
      organizationId: orgA.id,
      livemode: false,
    })

    customerInOrgB = await setupCustomer({
      organizationId: orgB.id,
      livemode: false,
    })
  })

  describe('Scenario 1: API Key with Focused Membership', () => {
    // This should already work - just verifying baseline behavior

    it('should access organization record when membership is focused', async () => {
      // Use orgB's API key where userA has focused membership
      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(
              await selectOrganizations({}, transaction)
            )
          },
          { apiKey: apiKeyOrgB.token }
        )
      ).unwrap()

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((org) => org.id === orgB.id)).toBe(true)
    })
  })

  describe('Scenario 2: API Key with UNFOCUSED Membership', () => {
    // userA has focused=false for orgA but should still be able to use orgA's API key

    it('should access organization record with unfocused membership', async () => {
      // Verify precondition: userA's membership in orgA is unfocused
      expect(membershipA_OrgA.focused).toBe(false)

      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(
              await selectOrganizations({}, transaction)
            )
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).unwrap()

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((org) => org.id === orgA.id)).toBe(true)
    })

    it('should access membership record with unfocused membership', async () => {
      // Verify precondition
      expect(membershipA_OrgA.focused).toBe(false)

      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(await selectMemberships({}, transaction))
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).unwrap()

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((m) => m.id === membershipA_OrgA.id)).toBe(
        true
      )
    })

    it('should access customers with unfocused membership', async () => {
      expect(membershipA_OrgA.focused).toBe(false)

      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(await selectCustomers({}, transaction))
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).unwrap()

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((c) => c.id === customerInOrgA.id)).toBe(
        true
      )
    })

    it('should access products with unfocused membership', async () => {
      expect(membershipA_OrgA.focused).toBe(false)

      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(await selectProducts({}, transaction))
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).unwrap()

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((p) => p.id === productInOrgA.id)).toBe(true)
    })

    it('should return correct userId and organizationId in transaction context', async () => {
      expect(membershipA_OrgA.focused).toBe(false)

      const result = (
        await authenticatedTransaction(
          async ({ userId, organizationId }) => {
            return Result.ok({ userId, organizationId })
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).unwrap()

      expect(result.userId).toBe(userA.id)
      expect(result.organizationId).toBe(orgA.id)
    })
  })

  describe('Scenario 3: Cross-Organization Isolation', () => {
    // Even though userA is a member of both orgs,
    // orgA's API key should NOT access orgB's data

    it('should NOT access customers from different org', async () => {
      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(await selectCustomers({}, transaction))
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).unwrap()

      // Should only see orgA's customers, NOT orgB's
      expect(result.some((c) => c.id === customerInOrgA.id)).toBe(
        true
      )
      expect(result.some((c) => c.id === customerInOrgB.id)).toBe(
        false
      )
    })

    it('should NOT access products from different org', async () => {
      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(await selectProducts({}, transaction))
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).unwrap()

      // Should only see orgA's products, NOT orgB's
      expect(result.some((p) => p.id === productInOrgA.id)).toBe(true)
      expect(result.some((p) => p.id === productInOrgB.id)).toBe(
        false
      )
    })

    it('should NOT access organization record from different org', async () => {
      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(
              await selectOrganizations({}, transaction)
            )
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).unwrap()

      // Should only see orgA, NOT orgB
      expect(result.some((org) => org.id === orgA.id)).toBe(true)
      expect(result.some((org) => org.id === orgB.id)).toBe(false)
    })
  })

  describe('Scenario 4: Webapp Authentication Preserves Focused Behavior', () => {
    // Webapp auth should still respect focused state
    // Note: This is harder to test without mocking the webapp auth flow
    // but we can verify the auth_type is correctly set

    it('API key auth should set auth_type to api_key in JWT claims', async () => {
      // This is implicitly tested by the fact that unfocused membership
      // scenarios work with API keys - the auth_type must be correctly
      // set for the RLS policy to allow access
      expect(membershipA_OrgA.focused).toBe(false)

      // If this works, auth_type must be 'api_key'
      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(await selectMemberships({}, transaction))
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).unwrap()

      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('Scenario 5: Livemode Isolation', () => {
    let livemodeApiKey: ApiKey.Record & { token: string }
    let testmodeCustomer: Customer.Record
    let livemodeCustomer: Customer.Record

    beforeEach(async () => {
      // Create livemode API key for orgA
      const livemodeSetup = await setupUserAndApiKey({
        organizationId: orgA.id,
        livemode: true,
      })
      livemodeApiKey = livemodeSetup.apiKey

      // customerInOrgA is already testmode (livemode: false)
      testmodeCustomer = customerInOrgA

      // Create livemode customer
      livemodeCustomer = await setupCustomer({
        organizationId: orgA.id,
        livemode: true,
      })
    })

    it('should NOT access livemode customers with testmode API key', async () => {
      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(await selectCustomers({}, transaction))
          },
          { apiKey: apiKeyOrgA.token } // testmode key
        )
      ).unwrap()

      // Should see testmode customer but NOT livemode
      expect(result.some((c) => c.id === testmodeCustomer.id)).toBe(
        true
      )
      expect(result.some((c) => c.id === livemodeCustomer.id)).toBe(
        false
      )
    })

    it('should NOT access testmode customers with livemode API key', async () => {
      const result = (
        await authenticatedTransaction(
          async ({ transaction }) => {
            return Result.ok(await selectCustomers({}, transaction))
          },
          { apiKey: livemodeApiKey.token }
        )
      ).unwrap()

      // Should see livemode customer but NOT testmode
      expect(result.some((c) => c.id === livemodeCustomer.id)).toBe(
        true
      )
      expect(result.some((c) => c.id === testmodeCustomer.id)).toBe(
        false
      )
    })
  })

  describe('Multi-org user with multiple API keys', () => {
    // User is member of multiple orgs, has API keys for each
    // Each API key should only access its respective org's data

    it('orgA API key accesses only orgA data, orgB API key accesses only orgB data', async () => {
      // Using orgA's API key
      const resultA = (
        await authenticatedTransaction(
          async ({ transaction, organizationId }) => {
            const customers = await selectCustomers({}, transaction)
            return Result.ok({ customers, organizationId })
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).unwrap()

      expect(resultA.organizationId).toBe(orgA.id)
      expect(
        resultA.customers.every((c) => c.organizationId === orgA.id)
      ).toBe(true)

      // Using orgB's API key
      const resultB = (
        await authenticatedTransaction(
          async ({ transaction, organizationId }) => {
            const customers = await selectCustomers({}, transaction)
            return Result.ok({ customers, organizationId })
          },
          { apiKey: apiKeyOrgB.token }
        )
      ).unwrap()

      expect(resultB.organizationId).toBe(orgB.id)
      expect(
        resultB.customers.every((c) => c.organizationId === orgB.id)
      ).toBe(true)
    })
  })

  describe('API Key DELETE RLS', () => {
    /**
     * Tests for the DELETE RLS policy on api_keys table.
     * Ensures users can only delete API keys within their own organization
     * and matching livemode.
     *
     * These tests use livemode: true to test the live mode deletion flow.
     */

    let apiKeyToDelete: ApiKey.Record
    let livemodeApiKeyOrgA: ApiKey.Record & { token: string }

    beforeEach(async () => {
      // Create a livemode API key for authentication in DELETE tests
      const livemodeToken = `live_sk_auth_${core.nanoid()}`
      livemodeApiKeyOrgA = (
        await adminTransaction(async ({ transaction }) => {
          const key = await insertApiKey(
            {
              organizationId: orgA.id,
              pricingModelId: orgAPricingModelIdLive,
              name: 'Livemode Auth API Key',
              token: livemodeToken,
              type: FlowgladApiKeyType.Secret,
              active: true,
              livemode: true,
              hashText: hashData(livemodeToken),
            },
            transaction
          )
          return Result.ok(await { ...key, token: livemodeToken })
        })
      ).unwrap()

      // Create an additional livemode API key in orgA for testing deletion
      apiKeyToDelete = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await insertApiKey(
              {
                organizationId: orgA.id,
                pricingModelId: orgAPricingModelIdLive,
                name: 'API Key To Delete',
                token: `live_sk_delete_${core.nanoid()}`,
                type: FlowgladApiKeyType.Secret,
                active: true,
                livemode: true, // livemode to match the livemode API keys
                hashText: `hash_delete_${core.nanoid()}`,
              },
              transaction
            )
          )
        })
      ).unwrap()
    })

    it('should ALLOW a user to delete API keys within their organization', async () => {
      // Use orgA's livemode API key to delete another livemode key in orgA
      // This should succeed because both keys belong to the same organization and livemode
      await authenticatedTransaction(
        async ({ transaction }) => {
          await deleteApiKey(apiKeyToDelete.id, transaction)
          return Result.ok(null)
        },
        { apiKey: livemodeApiKeyOrgA.token }
      )

      // Verify the key no longer exists
      const remainingKeys = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectApiKeys(
              { id: apiKeyToDelete.id },
              transaction
            )
          )
        })
      ).unwrap()
      expect(remainingKeys).toHaveLength(0)
    })

    it('should DENY a user from deleting API keys from another organization due to RLS', async () => {
      // Create a livemode API key in orgB
      const orgBApiKeyToDelete = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await insertApiKey(
              {
                organizationId: orgB.id,
                pricingModelId: orgBPricingModelIdLive,
                name: 'OrgB API Key To Delete',
                token: `live_sk_orgb_${core.nanoid()}`,
                type: FlowgladApiKeyType.Secret,
                active: true,
                livemode: true,
                hashText: `hash_orgb_${core.nanoid()}`,
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Try to delete orgB's key using orgA's livemode API key
      // RLS silently prevents the delete (no rows affected, no error thrown)
      await authenticatedTransaction(
        async ({ transaction }) => {
          await deleteApiKey(orgBApiKeyToDelete.id, transaction)
          return Result.ok(null)
        },
        { apiKey: livemodeApiKeyOrgA.token }
      )

      // Verify the key still exists - RLS prevented the delete
      const remainingKeys = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectApiKeys(
              { id: orgBApiKeyToDelete.id },
              transaction
            )
          )
        })
      ).unwrap()
      expect(remainingKeys).toHaveLength(1)
    })

    it('should DENY deleting API keys in different livemode', async () => {
      // Create a testmode API key in orgA
      const testmodeApiKey = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await insertApiKey(
              {
                organizationId: orgA.id,
                pricingModelId: orgAPricingModelIdTest,
                name: 'Testmode API Key',
                token: `test_sk_${core.nanoid()}`,
                type: FlowgladApiKeyType.Secret,
                active: true,
                livemode: false, // testmode key
                hashText: `hash_test_${core.nanoid()}`,
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Try to delete testmode key using livemode API key (livemodeApiKeyOrgA is livemode)
      // RLS silently prevents the delete due to livemode mismatch (no rows affected, no error thrown)
      await authenticatedTransaction(
        async ({ transaction }) => {
          await deleteApiKey(testmodeApiKey.id, transaction)
          return Result.ok(null)
        },
        { apiKey: livemodeApiKeyOrgA.token } // livemode key
      )

      // Verify the key still exists - RLS livemode policy prevented the delete
      const remainingKeys = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectApiKeys(
              { id: testmodeApiKey.id },
              transaction
            )
          )
        })
      ).unwrap()
      expect(remainingKeys).toHaveLength(1)
    })

    it('should successfully delete via deleteSecretApiKeyTransaction for own organization', async () => {
      // Use the full deleteSecretApiKeyTransaction flow
      await authenticatedTransaction(
        async (params) => {
          await deleteSecretApiKeyTransaction(
            { id: apiKeyToDelete.id },
            params
          )
          return Result.ok(null)
        },
        { apiKey: livemodeApiKeyOrgA.token }
      )

      // Verify the key no longer exists
      const remainingKeys = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectApiKeys(
              { id: apiKeyToDelete.id },
              transaction
            )
          )
        })
      ).unwrap()
      expect(remainingKeys).toHaveLength(0)
    })

    it('should DENY deleteSecretApiKeyTransaction for another organizations key', async () => {
      // Create an API key in orgB
      const orgBSecretKey = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await insertApiKey(
              {
                organizationId: orgB.id,
                pricingModelId: orgBPricingModelIdTest,
                name: 'OrgB Secret Key',
                token: `test_sk_orgb_secret_${core.nanoid()}`,
                type: FlowgladApiKeyType.Secret,
                active: true,
                livemode: false,
                hashText: `hash_orgb_secret_${core.nanoid()}`,
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Try to use deleteSecretApiKeyTransaction with orgA's context to delete orgB's key
      // This should fail because selectApiKeyById won't find the key (RLS prevents visibility)
      const result = await authenticatedTransaction(
        async (params) => {
          await deleteSecretApiKeyTransaction(
            { id: orgBSecretKey.id },
            params
          )
          return Result.ok(undefined)
        },
        { apiKey: apiKeyOrgA.token }
      )
      expect(Result.isError(result)).toBe(true)

      // Verify the key still exists
      const remainingKeys = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectApiKeys({ id: orgBSecretKey.id }, transaction)
          )
        })
      ).unwrap()
      expect(remainingKeys).toHaveLength(1)
    })
  })

  describe('Scenario 6: API Key Pricing Model Scoping for Customer Creation', () => {
    /**
     * These tests verify that:
     * 1. Customers created via API are assigned the API key's pricing model
     * 2. API key operations don't affect the membership's focusedPricingModelId
     * 3. Both default and non-default pricing models work correctly with API keys
     */

    let nonDefaultPricingModel: PricingModel.Record
    let apiKeyForNonDefault: ApiKey.Record & { token: string }

    beforeEach(async () => {
      // Create a non-default pricing model in orgA (testmode)
      nonDefaultPricingModel = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await insertPricingModel(
              {
                organizationId: orgA.id,
                name: 'Non-Default Pricing Model',
                livemode: false,
                isDefault: false,
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Create an API key tied to the non-default pricing model
      // Use insertApiKey directly like other tests to ensure proper setup
      const token = `test_sk_nondefault_${core.nanoid()}`
      const apiKey = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await insertApiKey(
              {
                organizationId: orgA.id,
                pricingModelId: nonDefaultPricingModel.id,
                name: 'Non-Default Pricing Model API Key',
                token,
                type: FlowgladApiKeyType.Secret,
                active: true,
                livemode: false,
                hashText: await hashData(token),
              },
              transaction
            )
          )
        })
      ).unwrap()
      apiKeyForNonDefault = { ...apiKey, token }
    })

    /**
     * Helper to create a TRPC caller with API key context
     */
    const createApiCaller = (
      organization: Organization.Record,
      apiKeyToken: string,
      apiKeyPricingModelId: string,
      livemode: boolean = false
    ) => {
      const ctx = {
        organizationId: organization.id,
        organization,
        apiKey: apiKeyToken,
        livemode,
        environment: (livemode ? 'live' : 'test') satisfies
          | 'live'
          | 'test',
        isApi: true,
        path: '',
        focusedPricingModelId: undefined,
        apiKeyPricingModelId,
      } as unknown as TRPCApiContext
      return customersRouter.createCaller(ctx)
    }

    it('should create customer in API key pricing model (non-default)', async () => {
      const caller = createApiCaller(
        orgA,
        apiKeyForNonDefault.token,
        nonDefaultPricingModel.id,
        false
      )

      const result = await caller.create({
        customer: {
          name: 'Test Customer Non-Default PM',
          email: `test+non-default-${Date.now()}@test.com`,
          externalId: `ext-non-default-${Date.now()}`,
        },
      })

      // Verify customer was created with the API key's (non-default) pricing model
      expect(result.data.customer.pricingModelId).toBe(
        nonDefaultPricingModel.id
      )
      // Should NOT be the default pricing model
      expect(result.data.customer.pricingModelId).not.toBe(
        orgAPricingModelIdTest
      )

      // Verify the customer exists in the database with correct pricing model
      const customerInDb = (
        await adminTransaction(async ({ transaction }) => {
          return selectCustomerById(
            result.data.customer.id,
            transaction
          )
        })
      ).unwrap()
      expect(customerInDb.pricingModelId).toBe(
        nonDefaultPricingModel.id
      )
    })

    it('should create customer in API key pricing model (default)', async () => {
      // Use the regular API key which is tied to the default pricing model
      const caller = createApiCaller(
        orgA,
        apiKeyOrgA.token,
        orgAPricingModelIdTest,
        false
      )

      const result = await caller.create({
        customer: {
          name: 'Test Customer Default PM',
          email: `test+default-${Date.now()}@test.com`,
          externalId: `ext-default-${Date.now()}`,
        },
      })

      // Verify customer was created with the default pricing model
      expect(result.data.customer.pricingModelId).toBe(
        orgAPricingModelIdTest
      )
    })

    it('API key usage should NOT affect membership focusedPricingModelId', async () => {
      // Get the membership's focusedPricingModelId before API call
      const membershipBefore = (
        await adminTransaction(async ({ transaction }) => {
          const [membership] = await selectMemberships(
            { userId: userA.id, organizationId: orgA.id },
            transaction
          )
          return Result.ok(membership)
        })
      ).unwrap()

      const originalFocusedPricingModelId =
        membershipBefore.focusedPricingModelId

      // Make an API call using the non-default pricing model API key
      // to create a customer
      const caller = createApiCaller(
        orgA,
        apiKeyForNonDefault.token,
        nonDefaultPricingModel.id,
        false
      )

      await caller.create({
        customer: {
          name: 'Test Customer For Focus Check',
          email: `test+focus-check-${Date.now()}@test.com`,
          externalId: `ext-focus-check-${Date.now()}`,
        },
      })

      // Verify the membership's focusedPricingModelId is unchanged
      const membershipAfter = (
        await adminTransaction(async ({ transaction }) => {
          const [membership] = await selectMemberships(
            { userId: userA.id, organizationId: orgA.id },
            transaction
          )
          return Result.ok(membership)
        })
      ).unwrap()

      expect(membershipAfter.focusedPricingModelId).toBe(
        originalFocusedPricingModelId
      )
    })

    it('should be able to read customer created with non-default PM using same API key', async () => {
      // Create customer using non-default pricing model API key
      const caller = createApiCaller(
        orgA,
        apiKeyForNonDefault.token,
        nonDefaultPricingModel.id,
        false
      )

      const externalId = `ext-read-test-${Date.now()}`
      await caller.create({
        customer: {
          name: 'Test Customer Read Check',
          email: `test+read-check-${Date.now()}@test.com`,
          externalId,
        },
      })

      // Should be able to read the customer back using the same API key
      const getResult = await caller.get({ externalId })
      expect(getResult.customer.externalId).toBe(externalId)
      expect(getResult.customer.pricingModelId).toBe(
        nonDefaultPricingModel.id
      )
    })

    it('should NOT be able to read customer from different pricing model', async () => {
      // Create customer using non-default pricing model API key
      const nonDefaultCaller = createApiCaller(
        orgA,
        apiKeyForNonDefault.token,
        nonDefaultPricingModel.id,
        false
      )

      const externalId = `ext-cross-pm-${Date.now()}`
      await nonDefaultCaller.create({
        customer: {
          name: 'Test Customer Cross PM',
          email: `test+cross-pm-${Date.now()}@test.com`,
          externalId,
        },
      })

      // Try to read the customer using the default pricing model API key
      // This should fail because RLS blocks cross-PM access
      const defaultCaller = createApiCaller(
        orgA,
        apiKeyOrgA.token,
        orgAPricingModelIdTest,
        false
      )

      await expect(
        defaultCaller.get({ externalId })
      ).rejects.toThrow()
    })
  })

  describe('Scenario 7: API Key Pricing Model Scoping for Discount Creation', () => {
    /**
     * These tests verify that:
     * 1. Discounts created via API without pricingModelId are assigned the API key's pricing model
     * 2. Both default and non-default pricing models work correctly with API keys
     */

    let nonDefaultPricingModel: PricingModel.Record
    let apiKeyForNonDefault: ApiKey.Record & { token: string }

    beforeEach(async () => {
      // Create a non-default pricing model in orgA (testmode)
      nonDefaultPricingModel = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await insertPricingModel(
              {
                organizationId: orgA.id,
                name: 'Non-Default Pricing Model for Discounts',
                livemode: false,
                isDefault: false,
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Create an API key tied to the non-default pricing model
      const token = `test_sk_discount_nondefault_${core.nanoid()}`
      const apiKey = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await insertApiKey(
              {
                organizationId: orgA.id,
                pricingModelId: nonDefaultPricingModel.id,
                name: 'Non-Default Pricing Model API Key for Discounts',
                token,
                type: FlowgladApiKeyType.Secret,
                active: true,
                livemode: false,
                hashText: await hashData(token),
              },
              transaction
            )
          )
        })
      ).unwrap()
      apiKeyForNonDefault = { ...apiKey, token }
    })

    /**
     * Helper to create a TRPC caller for discounts with API key context
     */
    const createDiscountApiCaller = (
      organization: Organization.Record,
      apiKeyToken: string,
      apiKeyPricingModelId: string,
      livemode: boolean = false
    ) => {
      const ctx = {
        organizationId: organization.id,
        organization,
        apiKey: apiKeyToken,
        livemode,
        environment: (livemode ? 'live' : 'test') satisfies
          | 'live'
          | 'test',
        isApi: true,
        path: '',
        focusedPricingModelId: undefined,
        apiKeyPricingModelId,
      } as unknown as TRPCApiContext
      return discountsRouter.createCaller(ctx)
    }

    it('should create discount in API key pricing model when pricingModelId not provided (non-default)', async () => {
      const caller = createDiscountApiCaller(
        orgA,
        apiKeyForNonDefault.token,
        nonDefaultPricingModel.id,
        false
      )

      // Discount code max length is 20 chars
      const discountCode = `ND${core.nanoid().slice(0, 10)}`
      const result = await caller.create({
        discount: {
          name: 'Test Discount Non-Default PM',
          code: discountCode,
          amount: 10,
          amountType: DiscountAmountType.Percent,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
          // Note: NOT providing pricingModelId - should use API key's pricing model
        },
      })

      // Verify discount was created with the API key's (non-default) pricing model
      expect(result.discount.pricingModelId).toBe(
        nonDefaultPricingModel.id
      )
      // Should NOT be the default pricing model
      expect(result.discount.pricingModelId).not.toBe(
        orgAPricingModelIdTest
      )

      // Verify the discount exists in the database with correct pricing model
      const discountInDb = (
        await adminTransaction(async ({ transaction }) => {
          return selectDiscountById(result.discount.id, transaction)
        })
      ).unwrap()
      expect(discountInDb.pricingModelId).toBe(
        nonDefaultPricingModel.id
      )
    })

    it('should create discount in API key pricing model when pricingModelId not provided (default)', async () => {
      // Use the regular API key which is tied to the default pricing model
      const caller = createDiscountApiCaller(
        orgA,
        apiKeyOrgA.token,
        orgAPricingModelIdTest,
        false
      )

      // Discount code max length is 20 chars
      const discountCode = `DF${core.nanoid().slice(0, 10)}`
      const result = await caller.create({
        discount: {
          name: 'Test Discount Default PM',
          code: discountCode,
          amount: 15,
          amountType: DiscountAmountType.Percent,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
          // Note: NOT providing pricingModelId - should use API key's pricing model
        },
      })

      // Verify discount was created with the default pricing model
      expect(result.discount.pricingModelId).toBe(
        orgAPricingModelIdTest
      )
    })

    it('should be able to read discount created with non-default PM using same API key', async () => {
      // Create discount using non-default pricing model API key
      const caller = createDiscountApiCaller(
        orgA,
        apiKeyForNonDefault.token,
        nonDefaultPricingModel.id,
        false
      )

      // Discount code max length is 20 chars
      const discountCode = `RD${core.nanoid().slice(0, 10)}`
      const createResult = await caller.create({
        discount: {
          name: 'Test Discount Read Check',
          code: discountCode,
          amount: 20,
          amountType: DiscountAmountType.Percent,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
      })

      // Should be able to read the discount back using the same API key
      const getResult = await caller.get({
        id: createResult.discount.id,
      })
      expect(getResult.discount.id).toBe(createResult.discount.id)
      expect(getResult.discount.pricingModelId).toBe(
        nonDefaultPricingModel.id
      )
    })

    it('should NOT be able to read discount from different pricing model', async () => {
      // Create discount using non-default pricing model API key
      const nonDefaultCaller = createDiscountApiCaller(
        orgA,
        apiKeyForNonDefault.token,
        nonDefaultPricingModel.id,
        false
      )

      // Discount code max length is 20 chars
      const discountCode = `XP${core.nanoid().slice(0, 10)}`
      const createResult = await nonDefaultCaller.create({
        discount: {
          name: 'Test Discount Cross PM',
          code: discountCode,
          amount: 25,
          amountType: DiscountAmountType.Percent,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
      })

      // Try to read the discount using the default pricing model API key
      // This should fail because RLS blocks cross-PM access
      const defaultCaller = createDiscountApiCaller(
        orgA,
        apiKeyOrgA.token,
        orgAPricingModelIdTest,
        false
      )

      await expect(
        defaultCaller.get({ id: createResult.discount.id })
      ).rejects.toThrow()
    })
  })
})
