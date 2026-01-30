import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { User } from '@db-core/schema/users'
import {
  setupOrg,
  setupUserAndApiKey,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'

/**
 * Tests for the enforce_focused_pm_org_constraint_trigger database trigger.
 *
 * This trigger enforces that focusedPricingModelId must belong to the same
 * organization as the membership. This is a security constraint to prevent
 * users from being focused on a pricing model that belongs to a different
 * organization than their membership.
 *
 * The trigger SQL creates:
 * 1. enforce_focused_pm_org_match() - A function that:
 *    - Allows NULL focusedPricingModelId (skip validation)
 *    - Looks up the organizationId of the pricing model
 *    - Raises exception if PM doesn't exist
 *    - Raises exception if PM's organizationId != membership's organizationId
 *
 * 2. enforce_focused_pm_org_constraint_trigger - A BEFORE INSERT OR UPDATE
 *    trigger on memberships table that calls the function.
 */
describe('enforce_focused_pm_org_constraint_trigger', () => {
  let organization: Organization.Record
  let user: User.Record
  let membership: Membership.Record
  let livePricingModel: PricingModel.Record
  let testmodePricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    livePricingModel = orgSetup.pricingModel!
    testmodePricingModel = orgSetup.testmodePricingModel!

    const userSetup = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    user = userSetup.user
    membership = userSetup.membership
  })

  afterEach(async () => {
    await teardownOrg({ organizationId: organization.id })
  })

  describe('allows valid focusedPricingModelId', () => {
    it('allows setting focusedPricingModelId to a PM belonging to the same organization', async () => {
      // This should succeed - the PM belongs to the same org as the membership
      await adminTransaction(async ({ transaction }) => {
        await updateMembership(
          {
            id: membership.id,
            focusedPricingModelId: livePricingModel.id,
          },
          transaction
        )
      })

      // Verify the update succeeded
      const result = await adminTransaction(
        async ({ transaction }) => {
          const memberships = await selectMemberships(
            { id: membership.id },
            transaction
          )
          return memberships[0]
        }
      )

      expect(result.focusedPricingModelId).toBe(livePricingModel.id)
    })

    it('allows switching between PMs within the same organization', async () => {
      // Set to live PM
      await adminTransaction(async ({ transaction }) => {
        await updateMembership(
          {
            id: membership.id,
            focusedPricingModelId: livePricingModel.id,
          },
          transaction
        )
      })

      // Switch to test PM (same org)
      await adminTransaction(async ({ transaction }) => {
        await updateMembership(
          {
            id: membership.id,
            focusedPricingModelId: testmodePricingModel.id,
          },
          transaction
        )
      })

      // Verify the update succeeded
      const result = await adminTransaction(
        async ({ transaction }) => {
          const memberships = await selectMemberships(
            { id: membership.id },
            transaction
          )
          return memberships[0]
        }
      )

      expect(result.focusedPricingModelId).toBe(
        testmodePricingModel.id
      )
    })
  })

  describe('rejects invalid focusedPricingModelId', () => {
    it('rejects setting focusedPricingModelId to a PM belonging to a different organization', async () => {
      // Create another organization with its own pricing model
      const { organization: otherOrg, pricingModel: otherPm } =
        await setupOrg()

      try {
        // Attempt to set focusedPricingModelId to a PM from a different org
        // This should fail due to the trigger
        await expect(
          adminTransaction(async ({ transaction }) => {
            await updateMembership(
              {
                id: membership.id,
                focusedPricingModelId: otherPm!.id,
              },
              transaction
            )
          })
        ).rejects.toThrow()
      } finally {
        await teardownOrg({ organizationId: otherOrg.id })
      }
    })

    it('rejects setting focusedPricingModelId to a non-existent PM', async () => {
      // Attempt to set focusedPricingModelId to a non-existent PM
      // This should fail due to the trigger
      await expect(
        adminTransaction(async ({ transaction }) => {
          await updateMembership(
            {
              id: membership.id,
              focusedPricingModelId: 'non-existent-pm-id',
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })
  })

  describe('trigger error messages', () => {
    it('throws error with details when attempting cross-org PM assignment', async () => {
      // Create another organization with its own pricing model
      const { organization: otherOrg, pricingModel: otherPm } =
        await setupOrg()

      try {
        await adminTransaction(async ({ transaction }) => {
          await updateMembership(
            {
              id: membership.id,
              focusedPricingModelId: otherPm!.id,
            },
            transaction
          )
        })
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        // Verify an error is thrown (trigger enforces cross-org constraint)
        expect(error).toBeInstanceOf(Error)
        // The error message includes the failed query details
        const errorMessage = (error as Error).message
        expect(errorMessage).toContain('memberships')
      } finally {
        await teardownOrg({ organizationId: otherOrg.id })
      }
    })

    it('throws error when attempting to set non-existent PM', async () => {
      const nonExistentId = 'fake-pm-id-12345'

      try {
        await adminTransaction(async ({ transaction }) => {
          await updateMembership(
            {
              id: membership.id,
              focusedPricingModelId: nonExistentId,
            },
            transaction
          )
        })
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        // Verify an error is thrown (trigger enforces PM existence)
        expect(error).toBeInstanceOf(Error)
        // The error message includes the failed query details
        const errorMessage = (error as Error).message
        expect(errorMessage).toContain('memberships')
      }
    })
  })
})
