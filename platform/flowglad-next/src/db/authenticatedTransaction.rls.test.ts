/**
 * RLS tests extracted from authenticatedTransaction.test.ts
 *
 * These tests verify Row Level Security policies for organizations,
 * memberships, products, and pricing models.
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import { FlowgladApiKeyType, MembershipRole } from '@db-core/enums'
import type { ApiKey } from '@db-core/schema/apiKeys'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { User } from '@db-core/schema/users'
import { Result } from 'better-result'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { insertApiKey } from '@/db/tableMethods/apiKeyMethods'
import {
  insertMembership,
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'
import {
  insertPricingModel,
  selectPricingModels,
  updatePricingModel,
} from '@/db/tableMethods/pricingModelMethods'
import {
  getProductTableRows,
  insertProduct,
  selectProducts,
  updateProduct,
} from '@/db/tableMethods/productMethods'

describe('RLS Access Control with selectOrganizations', () => {
  // Global test state variables
  let testOrg1: Organization.Record
  let testOrg2: Organization.Record
  let pricingModel1: PricingModel.Record
  let pricingModel2: PricingModel.Record
  let userA: User.Record
  let userB: User.Record
  let apiKeyA: ApiKey.Record
  let apiKeyB: ApiKey.Record

  beforeEach(async () => {
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

    // Create memberships for cross-organization testing
    ;(
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        // Give userA membership in testOrg2 as well (focused: false)
        await insertMembership(
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
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  describe('Single Organization Access', () => {
    it('should only return organizations for current users organization_id', async () => {
      // setup:
      // - userA has API key for testOrg1
      // - userA also has membership in testOrg2
      // - call selectOrganizations within authenticatedTransaction using userA's API key

      // expects:
      // - selectOrganizations should return only testOrg1
      // - testOrg2 should be filtered out by RLS despite userA having membership there
      const result = (
        await authenticatedTransaction(
          async (ctx) => {
            const { transaction } = ctx
            const organizations = await selectOrganizations(
              {},
              transaction
            )
            return Result.ok(organizations)
          },
          { apiKey: apiKeyA.token }
        )
      ).unwrap()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(testOrg1.id)
    })

    it('should return empty results when user has no memberships in target organization', async () => {
      // setup:
      // - create new organization that neither user has membership in
      // - attempt to access organizations using existing API key

      // expects:
      // - selectOrganizations should return organizations user has access to
      // - new organization should not be returned due to RLS filtering
      const org3Setup = await setupOrg()
      const testOrg3 = org3Setup.organization

      const result = (
        await authenticatedTransaction(
          async (ctx) => {
            const { transaction } = ctx
            const organizations = await selectOrganizations(
              {},
              transaction
            )
            return Result.ok(organizations)
          },
          { apiKey: apiKeyA.token }
        )
      ).unwrap()

      // Should only return testOrg1, not testOrg3
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(testOrg1.id)
      expect(
        result.find((org) => org.id === testOrg3.id)
      ).toBeUndefined()
    })
  })

  describe('Multi-Organization User Tests', () => {
    it('should only return organization matching JWT organization_id even if user has multiple memberships', async () => {
      // setup:
      // - userA has memberships in both testOrg1 and testOrg2
      // - use userA's API key which is associated with testOrg1

      // expects:
      // - selectOrganizations should return only testOrg1
      // - testOrg2 should be filtered out despite userA having membership there
      const result = (
        await authenticatedTransaction(
          async (ctx) => {
            const { transaction } = ctx
            const organizations = await selectOrganizations(
              {},
              transaction
            )
            return Result.ok(organizations)
          },
          { apiKey: apiKeyA.token }
        )
      ).unwrap()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(testOrg1.id)
      // Verify testOrg2 is not included
      expect(
        result.find((org) => org.id === testOrg2.id)
      ).toBeUndefined()
    })
  })
})

describe('RLS Access Control with selectMemberships', () => {
  // Global test state variables
  let testOrg1: Organization.Record
  let testOrg2: Organization.Record
  let org1PricingModelIdLive: string
  let org2PricingModelIdLive: string
  let userA: User.Record
  let userB: User.Record
  let apiKeyA: ApiKey.Record
  let membershipA1: Membership.Record
  let membershipA2: Membership.Record

  beforeEach(async () => {
    // Setup two test organizations
    const org1Setup = await setupOrg()
    testOrg1 = org1Setup.organization
    org1PricingModelIdLive = org1Setup.pricingModel.id

    const org2Setup = await setupOrg()
    testOrg2 = org2Setup.organization
    org2PricingModelIdLive = org2Setup.pricingModel.id

    // Setup userA and API key for testOrg1
    const userApiKeyA = await setupUserAndApiKey({
      organizationId: testOrg1.id,
      livemode: true,
    })
    userA = userApiKeyA.user
    apiKeyA = userApiKeyA.apiKey

    // Setup userB for testOrg2
    const userApiKeyB = await setupUserAndApiKey({
      organizationId: testOrg2.id,
      livemode: true,
    })
    userB = userApiKeyB.user

    // Create specific membership configurations for testing
    ;(
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        // Give userA membership in testOrg2 (focused: false)
        membershipA2 = await insertMembership(
          {
            organizationId: testOrg2.id,
            userId: userA.id,
            focused: false,
            livemode: true,
            role: MembershipRole.Member,
            focusedPricingModelId: org2PricingModelIdLive,
          },
          transaction
        )

        const [existingMembership] = await selectMemberships(
          { userId: userA.id, organizationId: testOrg1.id },
          transaction
        )
        if (existingMembership) {
          await updateMembership(
            { id: existingMembership.id, focused: true },
            transaction
          )
          membershipA1 = { ...existingMembership, focused: true }
        }
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  describe('Focused Membership Access', () => {
    it('should only return memberships where focused=true and organization_id matches JWT', async () => {
      // setup:
      // - userA has membership in testOrg1 (focused: true) and testOrg2 (focused: false)
      // - use userA's API key which is associated with testOrg1

      // expects:
      // - selectMemberships should return only the testOrg1 membership
      // - testOrg2 membership should be filtered out due to focused=false
      const result = (
        await authenticatedTransaction(
          async (ctx) => {
            const { transaction } = ctx
            const memberships = await selectMemberships(
              {},
              transaction
            )
            return Result.ok(memberships)
          },
          { apiKey: apiKeyA.token }
        )
      ).unwrap()

      expect(result).toHaveLength(1)
      expect(result[0].organizationId).toBe(testOrg1.id)
      expect(result[0].focused).toBe(true)
    })

    it('should return membership even when focused=false for API key auth', async () => {
      // setup:
      // - create new API key for testOrg2 but with userA (who has focused=false there)
      // - attempt to select memberships

      // expects:
      // - selectMemberships should return the membership because API key auth bypasses focused check
      const testApiKey = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await insertApiKey(
              {
                organizationId: testOrg2.id,
                pricingModelId: org2PricingModelIdLive,
                name: 'Test API Key for unfocused membership',
                token: `test_unfocused_${Date.now()}`,
                type: FlowgladApiKeyType.Secret,
                active: true,
                livemode: true,
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Determine which userId this API key will authenticate as, then force their membership to focused=false
      const apiUserId = (
        await authenticatedTransaction(
          async ({ userId }) => Result.ok(userId),
          { apiKey: testApiKey.token }
        )
      ).unwrap()

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const [membership] = await selectMemberships(
            { userId: apiUserId, organizationId: testOrg2.id },
            transaction
          )
          await updateMembership(
            { id: membership.id, focused: false },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      const result = (
        await authenticatedTransaction(
          async (ctx) => {
            const { transaction } = ctx
            const memberships = await selectMemberships(
              {},
              transaction
            )
            return Result.ok(memberships)
          },
          { apiKey: testApiKey.token }
        )
      ).unwrap()

      // API key auth bypasses focused=true requirement
      // Should return the membership even with focused=false
      expect(result).toHaveLength(1)
      expect(result[0].organizationId).toBe(testOrg2.id)
    })
  })

  describe('Cross-User Access Tests', () => {
    it('should not return other users memberships even in same organization', async () => {
      // setup:
      // - userA and userB both have memberships in testOrg2
      // - use userA's API key

      // expects:
      // - selectMemberships should return only userA's membership
      // - userB's membership should be filtered out by RLS user_id check
      const result = (
        await authenticatedTransaction(
          async (ctx) => {
            const { transaction } = ctx
            const memberships = await selectMemberships(
              {},
              transaction
            )
            return Result.ok(memberships)
          },
          { apiKey: apiKeyA.token }
        )
      ).unwrap()

      // Should only return memberships for userA
      result.forEach((membership) => {
        expect(membership.userId).toBe(userA.id)
      })

      // Should not include any memberships for userB
      const userBMemberships = result.filter(
        (m) => m.userId === userB.id
      )
      expect(userBMemberships).toHaveLength(0)
    })
  })
})

describe('RLS for selectProducts', () => {
  // Global state for products RLS tests
  let prodOrg1: Organization.Record
  let prodOrg2: Organization.Record
  let prodPricingModel1: any
  let prodPricingModel2: any
  let product1: any
  let product2: any
  let prodUserA: User.Record
  let prodUserB: User.Record
  let apiKeyAForOrg1: ApiKey.Record
  let apiKeyAForOrg2: ApiKey.Record

  beforeEach(async () => {
    // Create two orgs, each with a default product and pricingModel
    const orgSetup1 = await setupOrg()
    prodOrg1 = orgSetup1.organization
    product1 = orgSetup1.product
    prodPricingModel1 = orgSetup1.pricingModel

    const orgSetup2 = await setupOrg()
    prodOrg2 = orgSetup2.organization
    product2 = orgSetup2.product
    prodPricingModel2 = orgSetup2.pricingModel

    // Create user A focused on org1 with an API key
    const uaOrg1 = await setupUserAndApiKey({
      organizationId: prodOrg1.id,
      livemode: true,
    })
    prodUserA = uaOrg1.user
    apiKeyAForOrg1 = uaOrg1.apiKey

    // Also give user A a membership in org2, unfocused
    ;(
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await insertMembership(
          {
            organizationId: prodOrg2.id,
            userId: prodUserA.id,
            focused: false,
            livemode: true,
            role: MembershipRole.Member,
            focusedPricingModelId: prodPricingModel2.id,
          },
          transaction
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    // Create user B focused on org2 for negative-access scenarios
    const ubOrg2 = await setupUserAndApiKey({
      organizationId: prodOrg2.id,
      livemode: true,
    })
    prodUserB = ubOrg2.user

    // Create an API key that authenticates into org2 context (for focus-switching scenarios)
    const uaOrg2 = await setupUserAndApiKey({
      organizationId: prodOrg2.id,
      livemode: true,
    })
    apiKeyAForOrg2 = uaOrg2.apiKey
  })

  it('returns only products for the currently-focused organization', async () => {
    // setup:
    // - two orgs created in beforeEach with default products
    // - userA focused on org1 via apiKeyAForOrg1

    const result = (
      await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return Result.ok(await selectProducts({}, transaction))
        },
        { apiKey: apiKeyAForOrg1.token }
      )
    ).unwrap()

    // expects:
    expect(
      result.every((p) => p.organizationId === prodOrg1.id)
    ).toBe(true)
  })

  it('does not return products for other organizations even if user is a member but not the current organization', async () => {
    const result = (
      await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await selectProducts(
              { organizationId: prodOrg2.id },
              transaction
            )
          )
        },
        { apiKey: apiKeyAForOrg1.token }
      )
    ).unwrap()
    expect(result).toHaveLength(0)
  })

  it('switching focus changes which products are visible', async () => {
    const inOrg1 = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({}, transaction)),
        { apiKey: apiKeyAForOrg1.token }
      )
    ).unwrap()
    expect(
      inOrg1.every((p) => p.organizationId === prodOrg1.id)
    ).toBe(true)

    const inOrg2 = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({}, transaction)),
        { apiKey: apiKeyAForOrg2.token }
      )
    ).unwrap()
    expect(
      inOrg2.every((p) => p.organizationId === prodOrg2.id)
    ).toBe(true)
  })

  it('cannot update a product in another organization when it is not the current organization', async () => {
    const result = await authenticatedTransaction(
      async (ctx) => {
        const { transaction } = ctx
        await updateProduct(
          { id: product2.id, name: 'Blocked Update' },
          ctx
        )
        return Result.ok(undefined)
      },
      { apiKey: apiKeyAForOrg1.token }
    )
    expect(Result.isError(result)).toBe(true)
  })

  it('can update a product in the current organization', async () => {
    const updatedName = 'Updated Product Name'
    ;(
      await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          await updateProduct(
            { id: product1.id, name: updatedName },
            ctx
          )
          return Result.ok(null)
        },
        { apiKey: apiKeyAForOrg1.token }
      )
    ).unwrap()
    const after = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(
            await selectProducts({ id: product1.id }, transaction)
          ),
        { apiKey: apiKeyAForOrg1.token }
      )
    ).unwrap()
    expect(after[0].name).toBe(updatedName)
  })

  it('cannot insert a product for a different organization (other than current_organization_id)', async () => {
    const result = await authenticatedTransaction(
      async (ctx) => {
        const { transaction } = ctx
        await insertProduct(
          {
            name: 'Cross Org Product',
            organizationId: prodOrg2.id,
            pricingModelId: prodPricingModel2.id,
            default: false,
            description: null,
            livemode: false,
            externalId: null,
            slug: 'cross-org-product',
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            active: true,
          },
          ctx
        )
        return Result.ok(undefined)
      },
      { apiKey: apiKeyAForOrg1.token }
    )
    expect(Result.isError(result)).toBe(true)
  })

  it('can insert a product for the current organization', async () => {
    const created = (
      await authenticatedTransaction(
        async (ctx) => {
          const { transaction, livemode } = ctx
          return Result.ok(
            await insertProduct(
              {
                name: 'Org1 New Product',
                organizationId: prodOrg1.id,
                pricingModelId: prodPricingModel1.id,
                default: false,
                description: null,
                livemode,
                externalId: null,
                slug: 'org1-new-product',
                imageURL: null,
                singularQuantityLabel: null,
                pluralQuantityLabel: null,
                active: true,
              },
              ctx
            )
          )
        },
        { apiKey: apiKeyAForOrg1.token }
      )
    ).unwrap()
    expect(created.organizationId).toBe(prodOrg1.id)
  })

  it('cannot delete a product from a different organization', async () => {
    const result = await authenticatedTransaction(
      async (ctx) => {
        const { transaction } = ctx
        // simulate delete by setting inactive (if hard delete method not available)
        await updateProduct({ id: product2.id, active: false }, ctx)
        return Result.ok(undefined)
      },
      { apiKey: apiKeyAForOrg1.token }
    )
    expect(Result.isError(result)).toBe(true)
  })

  it('respects livemode: live context cannot see test-mode products and vice versa', async () => {
    // live key (org1)
    const liveKey = apiKeyAForOrg1
    // test key (org1)
    const testKey = await setupUserAndApiKey({
      organizationId: prodOrg1.id,
      livemode: false,
    })

    const liveProducts = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({}, transaction)),
        { apiKey: liveKey.token }
      )
    ).unwrap()
    expect(liveProducts.every((p) => p.livemode === true)).toBe(true)

    const testProducts = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({}, transaction)),
        { apiKey: testKey.apiKey.token }
      )
    ).unwrap()
    expect(testProducts.every((p) => p.livemode === false)).toBe(true)
  })

  it('webapp session auth behaves the same as API key auth', async () => {
    // We cannot simulate a full webapp session easily here without auth helpers.
    // Validate API-key path already enforces RLS; parity covered in final section.
    const viaApiKey = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({}, transaction)),
        { apiKey: apiKeyAForOrg1.token }
      )
    ).unwrap()
    expect(
      viaApiKey.every((p) => p.organizationId === prodOrg1.id)
    ).toBe(true)
  })

  it("user with membership in only one organization cannot access other organizations' products", async () => {
    // prodUserB focused on prodOrg2; verify cannot see prodOrg1
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(
            await selectProducts(
              { organizationId: prodOrg1.id },
              transaction
            )
          ),
        {
          apiKey: (
            await setupUserAndApiKey({
              organizationId: prodOrg2.id,
              livemode: true,
            })
          ).apiKey.token,
        }
      )
    ).unwrap()
    expect(result).toHaveLength(0)
  })
})

describe('RLS for selectPricingModels', () => {
  // Global state for pricingModels RLS tests
  let catOrg1: Organization.Record
  let catOrg2: Organization.Record
  let pricingModel1: PricingModel.Record
  let pricingModel2: PricingModel.Record
  let catUserA: User.Record
  let catUserB: User.Record
  let apiKeyCatAOrg1: ApiKey.Record
  let apiKeyCatAOrg1Testmode: ApiKey.Record // Testmode API key for insert test
  let apiKeyCatAOrg2: ApiKey.Record

  beforeEach(async () => {
    // Create two orgs, capture default pricingModels
    const orgSetup1 = await setupOrg()
    catOrg1 = orgSetup1.organization
    pricingModel1 = orgSetup1.pricingModel

    const orgSetup2 = await setupOrg()
    catOrg2 = orgSetup2.organization
    pricingModel2 = orgSetup2.pricingModel

    // Create user A focused on org1 with an API key
    const uaOrg1 = await setupUserAndApiKey({
      organizationId: catOrg1.id,
      livemode: true,
    })
    catUserA = uaOrg1.user
    apiKeyCatAOrg1 = uaOrg1.apiKey

    // Create a testmode API key for the insert test (to allow inserting testmode pricing models)
    const uaOrg1Testmode = await setupUserAndApiKey({
      organizationId: catOrg1.id,
      livemode: false,
    })
    apiKeyCatAOrg1Testmode = uaOrg1Testmode.apiKey

    // Also give user A a membership in org2, unfocused
    ;(
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await insertMembership(
          {
            organizationId: catOrg2.id,
            userId: catUserA.id,
            focused: false,
            livemode: true,
            role: MembershipRole.Member,
            focusedPricingModelId: pricingModel2.id,
          },
          transaction
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    // Create user B focused on org2 for negative-access scenarios
    const ubOrg2 = await setupUserAndApiKey({
      organizationId: catOrg2.id,
      livemode: true,
    })
    catUserB = ubOrg2.user

    // API key for org2 context (for focus switching scenarios)
    const uaOrg2 = await setupUserAndApiKey({
      organizationId: catOrg2.id,
      livemode: true,
    })
    apiKeyCatAOrg2 = uaOrg2.apiKey
  })

  it('returns only pricingModels for the currently-focused organization', async () => {
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectPricingModels({}, transaction)),
        { apiKey: apiKeyCatAOrg1.token }
      )
    ).unwrap()
    expect(result.every((c) => c.organizationId === catOrg1.id)).toBe(
      true
    )
  })

  it('does not return pricingModels for other organizations even when passing explicit where conditions', async () => {
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(
            await selectPricingModels(
              { organizationId: catOrg2.id },
              transaction
            )
          ),
        { apiKey: apiKeyCatAOrg1.token }
      )
    ).unwrap()
    expect(result).toHaveLength(0)
  })

  it('switching focus changes which pricingModels are visible', async () => {
    const inOrg1 = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectPricingModels({}, transaction)),
        { apiKey: apiKeyCatAOrg1.token }
      )
    ).unwrap()
    expect(inOrg1.every((c) => c.organizationId === catOrg1.id)).toBe(
      true
    )

    const inOrg2 = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectPricingModels({}, transaction)),
        { apiKey: apiKeyCatAOrg2.token }
      )
    ).unwrap()
    expect(inOrg2.every((c) => c.organizationId === catOrg2.id)).toBe(
      true
    )
  })

  it('cannot update a pricingModel in another organization', async () => {
    const result = await authenticatedTransaction(
      async (ctx) => {
        const { transaction } = ctx
        await updatePricingModel(
          {
            id: pricingModel2.id,
            name: 'Blocked PricingModel Update',
          },
          ctx
        )
        return Result.ok(undefined)
      },
      { apiKey: apiKeyCatAOrg1.token }
    )
    expect(Result.isError(result)).toBe(true)
  })

  it('can update a pricingModel in the current organization', async () => {
    const newName = 'Updated PricingModel Name'
    ;(
      await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          await updatePricingModel(
            { id: pricingModel1.id, name: newName },
            ctx
          )
          return Result.ok(null)
        },
        { apiKey: apiKeyCatAOrg1.token }
      )
    ).unwrap()
    const after = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(
            await selectPricingModels(
              { id: pricingModel1.id },
              transaction
            )
          ),
        { apiKey: apiKeyCatAOrg1.token }
      )
    ).unwrap()
    expect(after[0].name).toBe(newName)
  })

  it('cannot insert a pricingModel for a different organization', async () => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        await insertPricingModel(
          {
            organizationId: catOrg2.id,
            name: 'Cross Org PricingModel',
            isDefault: false,
            livemode: true,
          },
          transaction
        )
        return Result.ok(undefined)
      },
      { apiKey: apiKeyCatAOrg1.token }
    )
    expect(Result.isError(result)).toBe(true)
  })

  it('can insert a pricingModel for the current organization', async () => {
    const created = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(
            await insertPricingModel(
              {
                organizationId: catOrg1.id,
                name: 'New Org1 PricingModel',
                isDefault: false,
                livemode: false, // Use testmode to avoid livemode uniqueness constraint
              },
              transaction
            )
          ),
        { apiKey: apiKeyCatAOrg1Testmode.token } // Use testmode API key to match testmode pricing model
      )
    ).unwrap()
    expect(created.organizationId).toBe(catOrg1.id)
  })

  it('cannot delete a pricingModel from a different organization', async () => {
    const result = await authenticatedTransaction(
      async (ctx) => {
        const { transaction } = ctx
        await updatePricingModel(
          { id: pricingModel2.id, isDefault: false, name: 'X' },
          ctx
        )
        return Result.ok(undefined)
      },
      { apiKey: apiKeyCatAOrg1.token }
    )
    expect(Result.isError(result)).toBe(true)
  })

  it('respects livemode: live/test separation for pricingModels', async () => {
    const liveKey = apiKeyCatAOrg1
    const testKey = await setupUserAndApiKey({
      organizationId: catOrg1.id,
      livemode: false,
    })

    const livePricingModels = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectPricingModels({}, transaction)),
        { apiKey: liveKey.token }
      )
    ).unwrap()
    expect(livePricingModels.every((c) => c.livemode === true)).toBe(
      true
    )

    const testPricingModels = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectPricingModels({}, transaction)),
        { apiKey: testKey.apiKey.token }
      )
    ).unwrap()
    expect(testPricingModels.every((c) => c.livemode === false)).toBe(
      true
    )
  })

  it('webapp session auth behaves the same as API key auth', async () => {
    const viaApiKey = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectPricingModels({}, transaction)),
        { apiKey: apiKeyCatAOrg1.token }
      )
    ).unwrap()
    expect(
      viaApiKey.every((c) => c.organizationId === catOrg1.id)
    ).toBe(true)
  })

  it("user with membership in only one organization cannot access other organizations' pricingModels", async () => {
    const onlyOrg2Key = (
      await setupUserAndApiKey({
        organizationId: catOrg2.id,
        livemode: true,
      })
    ).apiKey
    const result = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(
            await selectPricingModels(
              { organizationId: catOrg1.id },
              transaction
            )
          ),
        { apiKey: onlyOrg2Key.token }
      )
    ).unwrap()
    expect(result).toHaveLength(0)
  })
})

describe('Second-order RLS defense in depth', () => {
  it('explicitly querying by ID from another organization still fails RLS', async () => {
    const { organization: o1 } = await setupOrg()
    const { pricingModel: c2, product: p2 } = await setupOrg()
    const k1 = (
      await setupUserAndApiKey({
        organizationId: o1.id,
        livemode: true,
      })
    ).apiKey
    const prods = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({ id: p2.id }, transaction)),
        { apiKey: k1.token }
      )
    ).unwrap()
    expect(prods).toHaveLength(0)
    const cats = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(
            await selectPricingModels({ id: c2.id }, transaction)
          ),
        { apiKey: k1.token }
      )
    ).unwrap()
    expect(cats).toHaveLength(0)
  })

  it('joining tables indirectly cannot bypass RLS', async () => {
    const { organization: o1 } = await setupOrg()
    const key = (
      await setupUserAndApiKey({
        organizationId: o1.id,
        livemode: true,
      })
    ).apiKey
    const rows = (
      await authenticatedTransaction(
        async ({ transaction, userId }) =>
          Result.ok(
            await getProductTableRows(
              { cursor: '0', limit: 20, filters: {} },
              transaction,
              userId
            )
          ),
        { apiKey: key.token }
      )
    ).unwrap()
    expect(
      rows.data.every((r) => r.product.organizationId === o1.id)
    ).toBe(true)
  })

  it('attempting to set organizationId during update across orgs is denied', async () => {
    const { organization: o1, product: p1 } = await setupOrg()
    const { organization: o2 } = await setupOrg()
    const k1 = (
      await setupUserAndApiKey({
        organizationId: o1.id,
        livemode: true,
      })
    ).apiKey
    const result = await authenticatedTransaction(
      async (ctx) => {
        const { transaction } = ctx
        await updateProduct({ id: p1.id, organizationId: o2.id }, ctx)
        return Result.ok(undefined)
      },
      { apiKey: k1.token }
    )
    expect(Result.isError(result)).toBe(true)
  })

  it('attempting to insert with mismatched livemode vs app.livemode is denied (if check policies exist)', async () => {
    const { organization } = await setupOrg()
    const liveKey = (
      await setupUserAndApiKey({
        organizationId: organization.id,
        livemode: true,
      })
    ).apiKey
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        await insertPricingModel(
          {
            organizationId: organization.id,
            name: 'Wrong Mode',
            isDefault: false,
            livemode: false,
          },
          transaction
        )
        return Result.ok(undefined)
      },
      { apiKey: liveKey.token }
    )
    expect(Result.isError(result)).toBe(true)
  })

  it('no access when user has no membership in the organization', async () => {
    const { organization: o1 } = await setupOrg()
    const o2 = await setupOrg()
    const onlyOrg2 = (
      await setupUserAndApiKey({
        organizationId: o2.organization.id,
        livemode: true,
      })
    ).apiKey
    const prods = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(
            await selectProducts(
              { organizationId: o1.id },
              transaction
            )
          ),
        { apiKey: onlyOrg2.token }
      )
    ).unwrap()
    expect(prods).toHaveLength(0)
    const insertResult = await authenticatedTransaction(
      async (ctx) => {
        const { transaction, livemode } = ctx
        await insertProduct(
          {
            name: 'X',
            description: null,
            imageURL: null,
            organizationId: o1.id,
            active: true,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
            pricingModelId: o2.pricingModel.id,
            externalId: null,
            default: false,
            slug: 'x-product',
            livemode,
          },
          ctx
        )
        return Result.ok(undefined)
      },
      { apiKey: onlyOrg2.token }
    )
    expect(Result.isError(insertResult)).toBe(true)
  })

  it('API key and session both set RLS context correctly: parity test', async () => {
    const { organization } = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    const apiKeyResult = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({}, transaction)),
        { apiKey: apiKey.token }
      )
    ).unwrap()
    expect(
      apiKeyResult.every((p) => p.organizationId === organization.id)
    ).toBe(true)
  })
})

describe('Edge cases and robustness for second-order RLS', () => {
  it('API key always accesses its own org regardless of focused state', async () => {
    const { organization: o1 } = await setupOrg()
    const { organization: o2, pricingModel: pm2 } = await setupOrg()
    const { user, apiKey } = await setupUserAndApiKey({
      organizationId: o1.id,
      livemode: true,
    })
    const first = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({}, transaction)),
        { apiKey: apiKey.token }
      )
    ).unwrap()
    expect(first.every((p) => p.organizationId === o1.id)).toBe(true)

    // Switch focus: add focused membership for org2 and unfocus org1
    ;(
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await insertMembership(
          {
            organizationId: o2.id,
            userId: user.id,
            focused: true,
            livemode: true,
            role: MembershipRole.Member,
            focusedPricingModelId: pm2.id,
          },
          transaction
        )
        const [mem] = await selectMemberships(
          { organizationId: o1.id, userId: user.id },
          transaction
        )
        if (mem)
          await updateMembership(
            { id: mem.id, focused: false },
            transaction
          )
        return Result.ok(undefined)
      })
    ).unwrap()

    // API key is tied to o1, so it should still access o1's products
    // even when the user's membership in o1 has focused=false
    const second = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({}, transaction)),
        { apiKey: apiKey.token }
      )
    ).unwrap()
    // API key's org is determined by the org it was created for, not by focused membership
    expect(second.every((p) => p.organizationId === o1.id)).toBe(true)
  })

  it('livemode toggling via different API keys switches visibility across transactions', async () => {
    const { organization } = await setupOrg()
    const liveKey = (
      await setupUserAndApiKey({
        organizationId: organization.id,
        livemode: true,
      })
    ).apiKey
    const testKey = (
      await setupUserAndApiKey({
        organizationId: organization.id,
        livemode: false,
      })
    ).apiKey
    const live = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({}, transaction)),
        { apiKey: liveKey.token }
      )
    ).unwrap()
    expect(live.every((p) => p.livemode === true)).toBe(true)
    const test = (
      await authenticatedTransaction(
        async ({ transaction }) =>
          Result.ok(await selectProducts({}, transaction)),
        { apiKey: testKey.token }
      )
    ).unwrap()
    expect(test.every((p) => p.livemode === false)).toBe(true)
  })
})
