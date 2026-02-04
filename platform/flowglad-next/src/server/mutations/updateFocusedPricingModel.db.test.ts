import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { User } from '@db-core/schema/users'
import { Result } from 'better-result'
import {
  setupOrg,
  setupUserAndApiKey,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectFocusedMembershipAndOrganization,
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { insertPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { updateFocusedPricingModelTransaction } from './updateFocusedPricingModel'

describe('updateFocusedPricingModelTransaction', () => {
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

    // Set initial focused membership and pricing model
    ;(
      await adminTransaction(async ({ transaction }) => {
        await updateMembership(
          {
            id: membership.id,
            focused: true,
            focusedPricingModelId: livePricingModel.id,
            livemode: true,
          },
          transaction
        )
        return Result.ok(null)
      })
    ).unwrap()
  })

  afterEach(async () => {
    await teardownOrg({ organizationId: organization.id })
  })

  describe('PM validation', () => {
    it('returns NOT_FOUND error when pricing model does not exist', async () => {
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await updateFocusedPricingModelTransaction(
              {
                pricingModelId: 'non-existent-pm-id',
                userId: user.id,
                organizationId: organization.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.code).toBe('NOT_FOUND')
        expect(result.error.message).toBe('Pricing model not found')
      }
    })

    it('returns FORBIDDEN error when pricing model belongs to a different organization', async () => {
      // Create another organization with its own pricing model
      const { organization: otherOrg, pricingModel: otherPm } =
        await setupOrg()

      try {
        const result = (
          await adminTransaction(async ({ transaction }) => {
            return Result.ok(
              await updateFocusedPricingModelTransaction(
                {
                  pricingModelId: otherPm!.id,
                  userId: user.id,
                  organizationId: organization.id,
                },
                transaction
              )
            )
          })
        ).unwrap()

        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error.code).toBe('FORBIDDEN')
          expect(result.error.message).toBe(
            'Pricing model does not belong to this organization'
          )
        }
      } finally {
        await teardownOrg({ organizationId: otherOrg.id })
      }
    })
  })

  describe('Focused membership validation', () => {
    it('returns NOT_FOUND error when user has no focused membership', async () => {
      // Unfocus the user's membership
      ;(
        await adminTransaction(async ({ transaction }) => {
          await updateMembership(
            {
              id: membership.id,
              focused: false,
            },
            transaction
          )
          return Result.ok(null)
        })
      ).unwrap()

      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await updateFocusedPricingModelTransaction(
              {
                pricingModelId: testmodePricingModel.id,
                userId: user.id,
                organizationId: organization.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.code).toBe('NOT_FOUND')
        expect(result.error.message).toBe(
          'No focused membership found for user'
        )
      }
    })

    it('returns FORBIDDEN error when focused membership organization does not match requested organization', async () => {
      // Create another organization with its own PM
      const {
        organization: otherOrg,
        pricingModel: otherPm,
        testmodePricingModel: otherTestPm,
      } = await setupOrg()

      // Create user in the other org with focused membership
      const { user: otherUser } = await setupUserAndApiKey({
        organizationId: otherOrg.id,
        livemode: true,
      })

      try {
        // User's focused membership is in otherOrg, but we request using organization.id
        // However, the PM belongs to otherOrg, so PM validation passes
        // The org mismatch comes from the focused membership check
        const result = (
          await adminTransaction(async ({ transaction }) => {
            return Result.ok(
              await updateFocusedPricingModelTransaction(
                {
                  pricingModelId: otherPm!.id,
                  userId: otherUser.id,
                  organizationId: organization.id, // Different org than user's focused membership
                },
                transaction
              )
            )
          })
        ).unwrap()

        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          // This will fail PM validation first since otherPm belongs to otherOrg, not organization
          expect(result.error.code).toBe('FORBIDDEN')
          expect(result.error.message).toBe(
            'Pricing model does not belong to this organization'
          )
        }
      } finally {
        await teardownOrg({ organizationId: otherOrg.id })
      }
    })

    it('returns FORBIDDEN when PM belongs to org but user focused membership is in different org', async () => {
      // Create another organization
      const { organization: otherOrg } = await setupOrg()

      // Create user in the other org with focused membership
      const { user: otherUser, membership: otherMembership } =
        await setupUserAndApiKey({
          organizationId: otherOrg.id,
          livemode: true,
        })

      // Ensure user is focused on otherOrg
      ;(
        await adminTransaction(async ({ transaction }) => {
          await updateMembership(
            {
              id: otherMembership.id,
              focused: true,
            },
            transaction
          )
          return Result.ok(null)
        })
      ).unwrap()

      try {
        // Request with our org's PM but passing organization.id
        // PM validation passes (livePricingModel belongs to organization)
        // But user's focused membership is in otherOrg, not organization
        const result = (
          await adminTransaction(async ({ transaction }) => {
            return Result.ok(
              await updateFocusedPricingModelTransaction(
                {
                  pricingModelId: livePricingModel.id,
                  userId: otherUser.id,
                  organizationId: organization.id,
                },
                transaction
              )
            )
          })
        ).unwrap()

        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error.code).toBe('FORBIDDEN')
          expect(result.error.message).toBe(
            'Focused membership does not match the requested organization'
          )
        }
      } finally {
        await teardownOrg({ organizationId: otherOrg.id })
      }
    })
  })

  describe('Successful update', () => {
    it('updates focusedPricingModelId to the requested PM', async () => {
      // Start with live PM, switch to test PM
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await updateFocusedPricingModelTransaction(
              {
                pricingModelId: testmodePricingModel.id,
                userId: user.id,
                organizationId: organization.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(Result.isOk(result)).toBe(true)
      if (Result.isOk(result)) {
        expect(result.value.membership.focusedPricingModelId).toBe(
          testmodePricingModel.id
        )
        expect(result.value.pricingModel.id).toBe(
          testmodePricingModel.id
        )
      }
      // Verify in database
      ;(
        await adminTransaction(async ({ transaction }) => {
          const memberships = await selectMemberships(
            { id: membership.id },
            transaction
          )
          expect(memberships).toHaveLength(1)
          expect(memberships[0].focusedPricingModelId).toBe(
            testmodePricingModel.id
          )
          return Result.ok(null)
        })
      ).unwrap()
    })

    it('auto-syncs membership livemode to match the PM livemode when switching from live to test PM', async () => {
      // Initially livemode=true, switching to test PM should set livemode=false
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await updateFocusedPricingModelTransaction(
              {
                pricingModelId: testmodePricingModel.id,
                userId: user.id,
                organizationId: organization.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(Result.isOk(result)).toBe(true)
      if (Result.isOk(result)) {
        expect(result.value.membership.livemode).toBe(false)
        expect(result.value.pricingModel.livemode).toBe(false)
      }
      // Verify in database
      ;(
        await adminTransaction(async ({ transaction }) => {
          const memberships = await selectMemberships(
            { id: membership.id },
            transaction
          )
          expect(memberships).toHaveLength(1)
          expect(memberships[0].livemode).toBe(false)
          return Result.ok(null)
        })
      ).unwrap()
    })

    it('auto-syncs membership livemode to match the PM livemode when switching from test to live PM', async () => {
      // First switch to test mode
      ;(
        await adminTransaction(async ({ transaction }) => {
          await updateMembership(
            {
              id: membership.id,
              focusedPricingModelId: testmodePricingModel.id,
              livemode: false,
            },
            transaction
          )
          return Result.ok(null)
        })
      ).unwrap()

      // Now switch back to live PM
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await updateFocusedPricingModelTransaction(
              {
                pricingModelId: livePricingModel.id,
                userId: user.id,
                organizationId: organization.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(Result.isOk(result)).toBe(true)
      if (Result.isOk(result)) {
        expect(result.value.membership.livemode).toBe(true)
        expect(result.value.pricingModel.livemode).toBe(true)
      }
      // Verify in database
      ;(
        await adminTransaction(async ({ transaction }) => {
          const memberships = await selectMemberships(
            { id: membership.id },
            transaction
          )
          expect(memberships).toHaveLength(1)
          expect(memberships[0].livemode).toBe(true)
          return Result.ok(null)
        })
      ).unwrap()
    })

    it('returns the updated membership and pricing model records', async () => {
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await updateFocusedPricingModelTransaction(
              {
                pricingModelId: testmodePricingModel.id,
                userId: user.id,
                organizationId: organization.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(Result.isOk(result)).toBe(true)
      if (Result.isOk(result)) {
        // Check membership fields
        expect(result.value.membership.id).toBe(membership.id)
        expect(result.value.membership.focusedPricingModelId).toBe(
          testmodePricingModel.id
        )
        expect(result.value.membership.livemode).toBe(false)

        // Check pricing model fields
        expect(result.value.pricingModel.id).toBe(
          testmodePricingModel.id
        )
        expect(result.value.pricingModel.name).toBe(
          testmodePricingModel.name
        )
        expect(result.value.pricingModel.livemode).toBe(false)
        expect(result.value.pricingModel.organizationId).toBe(
          organization.id
        )
      }
    })

    it('maintains livemode when switching to same-livemode PM (live to live)', async () => {
      // Verify we start in livemode
      const beforeResult = (
        await adminTransaction(async ({ transaction }) => {
          const memberships = await selectMemberships(
            { id: membership.id },
            transaction
          )
          return Result.ok(memberships[0])
        })
      ).unwrap()
      expect(beforeResult.livemode).toBe(true)
      expect(beforeResult.focusedPricingModelId).toBe(
        livePricingModel.id
      )

      // Switch to the same PM (should be a no-op effectively)
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await updateFocusedPricingModelTransaction(
              {
                pricingModelId: livePricingModel.id,
                userId: user.id,
                organizationId: organization.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(Result.isOk(result)).toBe(true)
      if (Result.isOk(result)) {
        expect(result.value.membership.focusedPricingModelId).toBe(
          livePricingModel.id
        )
        // Livemode should remain true
        expect(result.value.membership.livemode).toBe(true)
      }
    })
  })
})
