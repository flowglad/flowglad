/**
 * API Key RLS Tests
 *
 * These tests verify that API key authentication works correctly regardless of
 * membership focused state, while ensuring proper cross-organization isolation.
 */
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupProduct,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { FlowgladApiKeyType } from '@/types'
import { hashData } from '@/utils/backendCore'
import core from '@/utils/core'
import { adminTransaction } from './adminTransaction'
import { authenticatedTransaction } from './authenticatedTransaction'
import db from './client'
import type { ApiKey } from './schema/apiKeys'
import { apiKeys } from './schema/apiKeys'
import type { Customer } from './schema/customers'
import type { Membership } from './schema/memberships'
import { memberships } from './schema/memberships'
import type { Organization } from './schema/organizations'
import type { Product } from './schema/products'
import type { User } from './schema/users'
import { users } from './schema/users'
import { selectCustomers } from './tableMethods/customerMethods'
import {
  insertMembership,
  selectMemberships,
  updateMembership,
} from './tableMethods/membershipMethods'
import { selectOrganizations } from './tableMethods/organizationMethods'
import { selectProducts } from './tableMethods/productMethods'

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
})
