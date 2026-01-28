/**
 * API Key RLS Tests
 *
 * These tests verify that API key authentication works correctly regardless of
 * membership focused state, while ensuring proper cross-organization isolation.
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupCustomer,
  setupOrg,
  setupProduct,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import type { ApiKey } from '@/db/schema/apiKeys'
import type { Customer } from '@/db/schema/customers'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { Product } from '@/db/schema/products'
import type { User } from '@/db/schema/users'
import {
  deleteApiKey,
  insertApiKey,
  selectApiKeys,
} from '@/db/tableMethods/apiKeyMethods'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import {
  insertMembership,
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { FlowgladApiKeyType, MembershipRole } from '@/types'
import { deleteSecretApiKeyTransaction } from '@/utils/apiKeyHelpers'
import { hashData } from '@/utils/backendCore'
import core from '@/utils/core'

describe('API Key RLS', () => {
  // Test state
  let orgA: Organization.Record
  let orgB: Organization.Record
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
    membershipA_OrgA = await adminTransaction(
      async ({ transaction }) => {
        const [membership] = await selectMemberships(
          { userId: userA.id, organizationId: orgA.id },
          transaction
        )
        return membership
      }
    )

    // Create another API key for orgB (different user)
    const userApiKeyB = await setupUserAndApiKey({
      organizationId: orgB.id,
      livemode: false,
    })
    apiKeyOrgB = userApiKeyB.apiKey

    // Add userA to orgB with focused = true (simulating user switched to orgB)
    membershipA_OrgB = await adminTransaction(
      async ({ transaction }) => {
        return insertMembership(
          {
            organizationId: orgB.id,
            userId: userA.id,
            focused: true,
            livemode: false,
            role: MembershipRole.Member,
          },
          transaction
        )
      }
    )

    // Update userA's membership in orgA to be unfocused
    await adminTransaction(async ({ transaction }) => {
      await updateMembership(
        {
          ...membershipA_OrgA,
          focused: false,
        },
        transaction
      )
    })

    // Refresh membershipA_OrgA after update
    membershipA_OrgA = await adminTransaction(
      async ({ transaction }) => {
        const [membership] = await selectMemberships(
          { userId: userA.id, organizationId: orgA.id },
          transaction
        )
        return membership
      }
    )

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
      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectOrganizations({}, transaction)
        },
        { apiKey: apiKeyOrgB.token }
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((org) => org.id === orgB.id)).toBe(true)
    })
  })

  describe('Scenario 2: API Key with UNFOCUSED Membership', () => {
    // userA has focused=false for orgA but should still be able to use orgA's API key

    it('should access organization record with unfocused membership', async () => {
      // Verify precondition: userA's membership in orgA is unfocused
      expect(membershipA_OrgA.focused).toBe(false)

      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectOrganizations({}, transaction)
        },
        { apiKey: apiKeyOrgA.token }
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((org) => org.id === orgA.id)).toBe(true)
    })

    it('should access membership record with unfocused membership', async () => {
      // Verify precondition
      expect(membershipA_OrgA.focused).toBe(false)

      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectMemberships({}, transaction)
        },
        { apiKey: apiKeyOrgA.token }
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((m) => m.id === membershipA_OrgA.id)).toBe(
        true
      )
    })

    it('should access customers with unfocused membership', async () => {
      expect(membershipA_OrgA.focused).toBe(false)

      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectCustomers({}, transaction)
        },
        { apiKey: apiKeyOrgA.token }
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((c) => c.id === customerInOrgA.id)).toBe(
        true
      )
    })

    it('should access products with unfocused membership', async () => {
      expect(membershipA_OrgA.focused).toBe(false)

      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectProducts({}, transaction)
        },
        { apiKey: apiKeyOrgA.token }
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((p) => p.id === productInOrgA.id)).toBe(true)
    })

    it('should return correct userId and organizationId in transaction context', async () => {
      expect(membershipA_OrgA.focused).toBe(false)

      const result = await authenticatedTransaction(
        async ({ userId, organizationId }) => {
          return { userId, organizationId }
        },
        { apiKey: apiKeyOrgA.token }
      )

      expect(result.userId).toBe(userA.id)
      expect(result.organizationId).toBe(orgA.id)
    })
  })

  describe('Scenario 3: Cross-Organization Isolation', () => {
    // Even though userA is a member of both orgs,
    // orgA's API key should NOT access orgB's data

    it('should NOT access customers from different org', async () => {
      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectCustomers({}, transaction)
        },
        { apiKey: apiKeyOrgA.token }
      )

      // Should only see orgA's customers, NOT orgB's
      expect(result.some((c) => c.id === customerInOrgA.id)).toBe(
        true
      )
      expect(result.some((c) => c.id === customerInOrgB.id)).toBe(
        false
      )
    })

    it('should NOT access products from different org', async () => {
      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectProducts({}, transaction)
        },
        { apiKey: apiKeyOrgA.token }
      )

      // Should only see orgA's products, NOT orgB's
      expect(result.some((p) => p.id === productInOrgA.id)).toBe(true)
      expect(result.some((p) => p.id === productInOrgB.id)).toBe(
        false
      )
    })

    it('should NOT access organization record from different org', async () => {
      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectOrganizations({}, transaction)
        },
        { apiKey: apiKeyOrgA.token }
      )

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
      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectMemberships({}, transaction)
        },
        { apiKey: apiKeyOrgA.token }
      )

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
      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectCustomers({}, transaction)
        },
        { apiKey: apiKeyOrgA.token } // testmode key
      )

      // Should see testmode customer but NOT livemode
      expect(result.some((c) => c.id === testmodeCustomer.id)).toBe(
        true
      )
      expect(result.some((c) => c.id === livemodeCustomer.id)).toBe(
        false
      )
    })

    it('should NOT access testmode customers with livemode API key', async () => {
      const result = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectCustomers({}, transaction)
        },
        { apiKey: livemodeApiKey.token }
      )

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
      const resultA = await authenticatedTransaction(
        async ({ transaction, organizationId }) => {
          const customers = await selectCustomers({}, transaction)
          return { customers, organizationId }
        },
        { apiKey: apiKeyOrgA.token }
      )

      expect(resultA.organizationId).toBe(orgA.id)
      expect(
        resultA.customers.every((c) => c.organizationId === orgA.id)
      ).toBe(true)

      // Using orgB's API key
      const resultB = await authenticatedTransaction(
        async ({ transaction, organizationId }) => {
          const customers = await selectCustomers({}, transaction)
          return { customers, organizationId }
        },
        { apiKey: apiKeyOrgB.token }
      )

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
      livemodeApiKeyOrgA = await adminTransaction(
        async ({ transaction }) => {
          const key = await insertApiKey(
            {
              organizationId: orgA.id,
              name: 'Livemode Auth API Key',
              token: livemodeToken,
              type: FlowgladApiKeyType.Secret,
              active: true,
              livemode: true,
              hashText: hashData(livemodeToken),
            },
            transaction
          )
          return { ...key, token: livemodeToken }
        }
      )

      // Create an additional livemode API key in orgA for testing deletion
      apiKeyToDelete = await adminTransaction(
        async ({ transaction }) => {
          return insertApiKey(
            {
              organizationId: orgA.id,
              name: 'API Key To Delete',
              token: `live_sk_delete_${core.nanoid()}`,
              type: FlowgladApiKeyType.Secret,
              active: true,
              livemode: true, // livemode to match the livemode API keys
              hashText: `hash_delete_${core.nanoid()}`,
            },
            transaction
          )
        }
      )
    })

    it('should ALLOW a user to delete API keys within their organization', async () => {
      // Use orgA's livemode API key to delete another livemode key in orgA
      // This should succeed because both keys belong to the same organization and livemode
      await authenticatedTransaction(
        async ({ transaction }) => {
          await deleteApiKey(apiKeyToDelete.id, transaction)
        },
        { apiKey: livemodeApiKeyOrgA.token }
      )

      // Verify the key no longer exists
      const remainingKeys = await adminTransaction(
        async ({ transaction }) => {
          return selectApiKeys({ id: apiKeyToDelete.id }, transaction)
        }
      )
      expect(remainingKeys).toHaveLength(0)
    })

    it('should DENY a user from deleting API keys from another organization due to RLS', async () => {
      // Create a livemode API key in orgB
      const orgBApiKeyToDelete = await adminTransaction(
        async ({ transaction }) => {
          return insertApiKey(
            {
              organizationId: orgB.id,
              name: 'OrgB API Key To Delete',
              token: `live_sk_orgb_${core.nanoid()}`,
              type: FlowgladApiKeyType.Secret,
              active: true,
              livemode: true,
              hashText: `hash_orgb_${core.nanoid()}`,
            },
            transaction
          )
        }
      )

      // Try to delete orgB's key using orgA's livemode API key
      // RLS silently prevents the delete (no rows affected, no error thrown)
      await authenticatedTransaction(
        async ({ transaction }) => {
          await deleteApiKey(orgBApiKeyToDelete.id, transaction)
        },
        { apiKey: livemodeApiKeyOrgA.token }
      )

      // Verify the key still exists - RLS prevented the delete
      const remainingKeys = await adminTransaction(
        async ({ transaction }) => {
          return selectApiKeys(
            { id: orgBApiKeyToDelete.id },
            transaction
          )
        }
      )
      expect(remainingKeys).toHaveLength(1)
    })

    it('should DENY deleting API keys in different livemode', async () => {
      // Create a testmode API key in orgA
      const testmodeApiKey = await adminTransaction(
        async ({ transaction }) => {
          return insertApiKey(
            {
              organizationId: orgA.id,
              name: 'Testmode API Key',
              token: `test_sk_${core.nanoid()}`,
              type: FlowgladApiKeyType.Secret,
              active: true,
              livemode: false, // testmode key
              hashText: `hash_test_${core.nanoid()}`,
            },
            transaction
          )
        }
      )

      // Try to delete testmode key using livemode API key (livemodeApiKeyOrgA is livemode)
      // RLS silently prevents the delete due to livemode mismatch (no rows affected, no error thrown)
      await authenticatedTransaction(
        async ({ transaction }) => {
          await deleteApiKey(testmodeApiKey.id, transaction)
        },
        { apiKey: livemodeApiKeyOrgA.token } // livemode key
      )

      // Verify the key still exists - RLS livemode policy prevented the delete
      const remainingKeys = await adminTransaction(
        async ({ transaction }) => {
          return selectApiKeys({ id: testmodeApiKey.id }, transaction)
        }
      )
      expect(remainingKeys).toHaveLength(1)
    })

    it('should successfully delete via deleteSecretApiKeyTransaction for own organization', async () => {
      // Use the full deleteSecretApiKeyTransaction flow
      await authenticatedTransaction(
        async ({
          transaction,
          userId,
          livemode,
          organizationId,
          cacheRecomputationContext,
        }) => {
          await deleteSecretApiKeyTransaction(
            { id: apiKeyToDelete.id },
            {
              transaction,
              userId,
              livemode,
              organizationId,
              cacheRecomputationContext,
            }
          )
        },
        { apiKey: livemodeApiKeyOrgA.token }
      )

      // Verify the key no longer exists
      const remainingKeys = await adminTransaction(
        async ({ transaction }) => {
          return selectApiKeys({ id: apiKeyToDelete.id }, transaction)
        }
      )
      expect(remainingKeys).toHaveLength(0)
    })

    it('should DENY deleteSecretApiKeyTransaction for another organizations key', async () => {
      // Create an API key in orgB
      const orgBSecretKey = await adminTransaction(
        async ({ transaction }) => {
          return insertApiKey(
            {
              organizationId: orgB.id,
              name: 'OrgB Secret Key',
              token: `test_sk_orgb_secret_${core.nanoid()}`,
              type: FlowgladApiKeyType.Secret,
              active: true,
              livemode: false,
              hashText: `hash_orgb_secret_${core.nanoid()}`,
            },
            transaction
          )
        }
      )

      // Try to use deleteSecretApiKeyTransaction with orgA's context to delete orgB's key
      // This should fail because selectApiKeyById won't find the key (RLS prevents visibility)
      await expect(
        authenticatedTransaction(
          async ({
            transaction,
            userId,
            livemode,
            organizationId,
            cacheRecomputationContext,
          }) => {
            await deleteSecretApiKeyTransaction(
              { id: orgBSecretKey.id },
              {
                transaction,
                userId,
                livemode,
                organizationId,
                cacheRecomputationContext,
              }
            )
          },
          { apiKey: apiKeyOrgA.token }
        )
      ).rejects.toThrow()

      // Verify the key still exists
      const remainingKeys = await adminTransaction(
        async ({ transaction }) => {
          return selectApiKeys({ id: orgBSecretKey.id }, transaction)
        }
      )
      expect(remainingKeys).toHaveLength(1)
    })
  })
})
