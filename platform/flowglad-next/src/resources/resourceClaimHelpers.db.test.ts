import { beforeEach, describe, expect, it } from 'bun:test'
import {
  FeatureType,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Resource } from '@db-core/schema/resources'
import type { SubscriptionItemFeature } from '@db-core/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@db-core/schema/subscriptionItems'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupResource,
  setupResourceClaim,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { insertFeature } from '@/db/tableMethods/featureMethods'
import {
  countActiveResourceClaims,
  selectActiveResourceClaims,
} from '@/db/tableMethods/resourceClaimMethods'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import {
  claimResourceTransaction,
  getResourceUsage,
  getResourceUsageInputSchema,
  releaseAllResourceClaimsForSubscription,
  releaseExpiredResourceClaims,
  releaseResourceTransaction,
} from './resourceClaimHelpers'

describe('resourceClaimHelpers', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let customer: Customer.Record
  let resource: Resource.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record
  let subscriptionItemFeature: SubscriptionItemFeature.ResourceRecord

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    resource = await setupResource({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      slug: 'seats',
      name: 'Seats',
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
    })

    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    const product = await setupProduct({
      organizationId: organization.id,
      name: 'Test Product',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Resource Subscription Item',
      quantity: 1,
      unitPrice: 1000,
    })

    // Create a Resource feature
    const resourceFeature = (
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await insertFeature(
            {
              organizationId: organization.id,
              pricingModelId: pricingModel.id,
              type: FeatureType.Resource,
              name: 'Seats Feature',
              slug: 'seats-feature',
              description: 'Resource feature for seats',
              amount: 5,
              usageMeterId: null,
              renewalFrequency: null,
              resourceId: resource.id,
              livemode: true,
              active: true,
            },
            ctx
          )
        )
      })
    ).unwrap()

    subscriptionItemFeature =
      await setupResourceSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: resourceFeature.id,
        resourceId: resource.id,
        pricingModelId: pricingModel.id,
        amount: 5,
      })
  })

  describe('claimResourceTransaction', () => {
    it('when subscription is in a terminal state, throws an error indicating the subscription is not active', async () => {
      // Cancel the subscription
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateSubscription(
            {
              id: subscription.id,
              status: SubscriptionStatus.Canceled,
              canceledAt: Date.now(),
              renews: true,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await claimResourceTransaction(
          {
            organizationId: organization.id,
            customerId: customer.id,
            input: {
              resourceSlug: 'seats',
              subscriptionId: subscription.id,
              quantity: 1,
            },
          },
          transaction
        )
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain('is not active')
      }
    })

    it('when capacity is exhausted, returns an error indicating no available capacity', async () => {
      // Create 5 claims to exhaust the capacity
      for (let i = 0; i < 5; i++) {
        await setupResourceClaim({
          organizationId: organization.id,
          resourceId: resource.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: `user-${i}`,
        })
      }

      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return claimResourceTransaction(
          {
            organizationId: organization.id,
            customerId: customer.id,
            input: {
              resourceSlug: 'seats',
              subscriptionId: subscription.id,
              quantity: 1,
            },
          },
          transaction
        )
      })
      // claimResourceTransaction returns Result.err, which adminTransaction
      // propagates as Result.err on the outer result
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'No available capacity'
        )
      }
    })

    it('when quantity is provided, creates that many anonymous claims with externalId=null and returns accurate usage', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 3,
              },
            },
            transaction
          )
        })
      ).unwrap()

      expect(result.claims.length).toBe(3)
      expect(result.claims.every((c) => c.externalId === null)).toBe(
        true
      )
      expect(result.claims.every((c) => c.releasedAt === null)).toBe(
        true
      )
      expect(result.usage).toMatchObject({
        resourceSlug: 'seats',
        capacity: 5,
        claimed: 3,
        available: 2,
      })
      expect(result.usage.resourceId).toBe(resource.id)
    })

    it('when externalId is provided, creates a single named claim with that externalId', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalId: 'user_123',
              },
            },
            transaction
          )
        })
      ).unwrap()

      expect(result.claims.length).toBe(1)
      expect(result.claims[0].externalId).toBe('user_123')
      expect(result.usage).toMatchObject({
        resourceSlug: 'seats',
        capacity: 5,
        claimed: 1,
        available: 4,
      })
      expect(result.usage.resourceId).toBe(resource.id)
    })

    it('when claiming with an already active externalId, returns the existing claim without creating a duplicate (idempotent)', async () => {
      // Create first claim
      const firstResult = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalId: 'user_123',
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Attempt to claim again with same externalId
      const secondResult = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalId: 'user_123',
              },
            },
            transaction
          )
        })
      ).unwrap()

      expect(secondResult.claims.length).toBe(1)
      expect(secondResult.claims[0].id).toBe(firstResult.claims[0].id)
      expect(secondResult.usage).toMatchObject({
        resourceSlug: 'seats',
        capacity: 5,
        claimed: 1, // Not 2
        available: 4,
      })
      expect(secondResult.usage.resourceId).toBe(resource.id)
    })

    it('when externalIds are provided, creates multiple named claims, and existing claims are returned idempotently', async () => {
      // Create one claim first
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalId: 'existing_user',
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Now claim with multiple externalIds including the existing one
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalIds: [
                  'existing_user',
                  'new_user_1',
                  'new_user_2',
                ],
              },
            },
            transaction
          )
        })
      ).unwrap()

      expect(result.claims.length).toBe(3)
      expect(result.claims.map((c) => c.externalId).sort()).toEqual(
        ['existing_user', 'new_user_1', 'new_user_2'].sort()
      )
      expect(result.usage).toMatchObject({
        resourceSlug: 'seats',
        capacity: 5,
        claimed: 3,
        available: 2,
      })
      expect(result.usage.resourceId).toBe(resource.id)
    })

    describe('optimistic locking behavior', () => {
      it('when claiming multiple resources atomically, either all claims succeed or none do (no partial inserts)', async () => {
        // Pre-fill 4 of 5 capacity slots
        for (let i = 0; i < 4; i++) {
          await setupResourceClaim({
            organizationId: organization.id,
            resourceId: resource.id,
            subscriptionId: subscription.id,
            pricingModelId: pricingModel.id,
            externalId: `prefill-${i}`,
          })
        }

        // Try to claim 2 resources when only 1 slot available
        // Should fail completely - no partial insert
        const result = await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 2,
              },
            },
            transaction
          )
        })
        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error.message).toContain(
            'No available capacity'
          )
        }

        // Verify no partial claims were created - should still have exactly 4
        const activeClaims = (
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return Result.ok(
              await selectActiveResourceClaims(
                {
                  subscriptionId: subscription.id,
                  resourceId: resource.id,
                },
                transaction
              )
            )
          })
        ).unwrap()
        expect(activeClaims.length).toBe(4)
        // All should be our prefill claims
        expect(
          activeClaims.every((c) =>
            c.externalId?.startsWith('prefill-')
          )
        ).toBe(true)
      })

      it('when batch claim succeeds, all claims are inserted atomically', async () => {
        // Claim 3 resources atomically
        const result = (
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: 'seats',
                  subscriptionId: subscription.id,
                  externalIds: ['user-a', 'user-b', 'user-c'],
                },
              },
              transaction
            )
          })
        ).unwrap()

        // All 3 should be created
        expect(result.claims.length).toBe(3)
        expect(result.claims.map((c) => c.externalId).sort()).toEqual(
          ['user-a', 'user-b', 'user-c']
        )

        // Verify in database
        const activeClaims = (
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return Result.ok(
              await selectActiveResourceClaims(
                {
                  subscriptionId: subscription.id,
                  resourceId: resource.id,
                },
                transaction
              )
            )
          })
        ).unwrap()
        expect(activeClaims.length).toBe(3)
      })

      it('when exact capacity is requested, succeeds without over-claiming', async () => {
        // Claim exactly 5 (full capacity)
        const result = (
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: 'seats',
                  subscriptionId: subscription.id,
                  quantity: 5,
                },
              },
              transaction
            )
          })
        ).unwrap()

        expect(result.claims.length).toBe(5)
        expect(result.usage).toMatchObject({
          capacity: 5,
          claimed: 5,
          available: 0,
        })

        // Trying to claim one more should fail
        const failResult = await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 1,
              },
            },
            transaction
          )
        })
        expect(Result.isError(failResult)).toBe(true)
        if (Result.isError(failResult)) {
          expect(failResult.error.message).toContain(
            'No available capacity'
          )
        }
      })
    })
  })

  describe('releaseResourceTransaction', () => {
    it('when quantity is provided, releases only anonymous claims (FIFO) and ignores named claims', async () => {
      // Create 3 anonymous claims
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 3,
              },
            },
            transaction
          )
        })
      ).unwrap()
      // Create 2 named claims
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalIds: ['named_user_1', 'named_user_2'],
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Release 2 anonymous claims
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await releaseResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: 'seats',
                  subscriptionId: subscription.id,
                  quantity: 2,
                },
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(result.releasedClaims.length).toBe(2)
      expect(
        result.releasedClaims.every((c) => c.externalId === null)
      ).toBe(true)
      expect(
        result.releasedClaims.every((c) => c.releasedAt !== null)
      ).toBe(true)

      // Verify remaining claims: 1 anonymous + 2 named = 3 total
      expect(result.usage).toMatchObject({
        resourceSlug: 'seats',
        capacity: 5,
        claimed: 3,
        available: 2,
      })
      expect(result.usage.resourceId).toBe(resource.id)

      // Verify the named claims are still active
      const activeClaims = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
          )
        })
      ).unwrap()
      const namedClaims = activeClaims.filter(
        (c) => c.externalId !== null
      )
      expect(namedClaims.length).toBe(2)
    })

    it('when trying to release more anonymous claims than exist, throws an error', async () => {
      // Create only 2 anonymous claims
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 2,
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Try to release 3
      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await releaseResourceTransaction(
          {
            organizationId: organization.id,
            customerId: customer.id,
            input: {
              resourceSlug: 'seats',
              subscriptionId: subscription.id,
              quantity: 3,
            },
          },
          transaction
        )
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Cannot release 3 anonymous claims. Only 2 exist. Use claimIds to release specific claims regardless of type.'
        )
      }
    })

    it('when externalId is provided, releases the specific named claim and sets releaseReason to released', async () => {
      // Create a named claim
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalId: 'user_to_release',
              },
            },
            transaction
          )
        })
      ).unwrap()

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await releaseResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: 'seats',
                  subscriptionId: subscription.id,
                  externalId: 'user_to_release',
                },
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(result.releasedClaims.length).toBe(1)
      expect(result.releasedClaims[0].externalId).toBe(
        'user_to_release'
      )
      expect(result.releasedClaims[0].releaseReason).toBe('released')
      expect(result.usage).toMatchObject({
        resourceSlug: 'seats',
        capacity: 5,
        claimed: 0,
        available: 5,
      })
      expect(result.usage.resourceId).toBe(resource.id)
    })

    it('when releasing a non-existent externalId, throws an error', async () => {
      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await releaseResourceTransaction(
          {
            organizationId: organization.id,
            customerId: customer.id,
            input: {
              resourceSlug: 'seats',
              subscriptionId: subscription.id,
              externalId: 'nonexistent_user',
            },
          },
          transaction
        )
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'No active claim found with externalId'
        )
      }
    })

    it('when claimIds are provided, releases those specific claims regardless of type', async () => {
      // Create mixed claims
      const anonymousResult = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 2,
              },
            },
            transaction
          )
        })
      ).unwrap()

      const namedResult = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalId: 'named_user',
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Release one anonymous and one named by ID
      const claimIdsToRelease = [
        anonymousResult.claims[0].id,
        namedResult.claims[0].id,
      ]

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await releaseResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: 'seats',
                  subscriptionId: subscription.id,
                  claimIds: claimIdsToRelease,
                },
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(result.releasedClaims.length).toBe(2)
      expect(result.usage).toMatchObject({
        resourceSlug: 'seats',
        capacity: 5,
        claimed: 1, // One anonymous claim remains
        available: 4,
      })
      expect(result.usage.resourceId).toBe(resource.id)
    })
  })

  describe('releaseAllResourceClaimsForSubscription', () => {
    it('releases all active claims for a subscription with the given reason, including both anonymous and named claims', async () => {
      // Create mixed claims: 3 anonymous + 2 named = 5 total
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 3,
              },
            },
            transaction
          )
        })
      ).unwrap()

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalIds: ['named_1', 'named_2'],
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Release all claims
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await releaseAllResourceClaimsForSubscription(
              subscription.id,
              'subscription_canceled',
              transaction
            )
          )
        })
      ).unwrap()

      expect(result.releasedCount).toBe(5)

      // Verify all claims are released
      const activeClaims = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await selectActiveResourceClaims(
              { subscriptionId: subscription.id },
              transaction
            )
          )
        })
      ).unwrap()
      expect(activeClaims.length).toBe(0)
    })

    it('when there are no active claims, returns releasedCount of 0', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await releaseAllResourceClaimsForSubscription(
              subscription.id,
              'subscription_canceled',
              transaction
            )
          )
        })
      ).unwrap()

      expect(result.releasedCount).toBe(0)
    })
  })

  describe('getResourceUsage', () => {
    it('returns accurate capacity, claimed count, and available slots', async () => {
      // Create 3 claims
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 3,
              },
            },
            transaction
          )
        })
      ).unwrap()

      const usage = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
          )
        })
      ).unwrap()

      expect(usage).toEqual({
        capacity: 5,
        claimed: 3,
        available: 2,
      })
    })

    it('when no claims exist, returns full capacity as available', async () => {
      const usage = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
          )
        })
      ).unwrap()

      expect(usage).toEqual({
        capacity: 5,
        claimed: 0,
        available: 5,
      })
    })
  })

  describe('selectActiveResourceClaims with array filtering', () => {
    it('when filtering by subscriptionId and resourceId array, returns all active claims for those resources', async () => {
      // Create 2 anonymous claims and 1 named claim
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 2,
              },
            },
            transaction
          )
        })
      ).unwrap()

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalId: 'named_user_1',
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Fetch claims using array-based resourceId filtering (as the router does)
      const claims = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: [resource.id],
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(claims.length).toBe(3)
      expect(
        claims.every((c) => c.subscriptionId === subscription.id)
      ).toBe(true)
      expect(claims.every((c) => c.resourceId === resource.id)).toBe(
        true
      )

      // Verify we have both anonymous and named claims
      const anonymousClaims = claims.filter(
        (c) => c.externalId === null
      )
      const namedClaims = claims.filter((c) => c.externalId !== null)
      expect(anonymousClaims.length).toBe(2)
      expect(namedClaims.length).toBe(1)
      expect(namedClaims[0].externalId).toBe('named_user_1')
    })

    it('when no claims exist for the specified resources, returns an empty array', async () => {
      const claims = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: [resource.id],
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(claims).toEqual([])
    })
  })

  describe('claimResourceTransaction - additional coverage', () => {
    it('when metadata is provided, persists metadata to the created claims', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalId: 'user_with_metadata',
                metadata: { team: 'engineering', role: 'admin' },
              },
            },
            transaction
          )
        })
      ).unwrap()

      expect(result.claims.length).toBe(1)
      expect(result.claims[0].metadata).toEqual({
        team: 'engineering',
        role: 'admin',
      })
    })

    it('when subscriptionId is omitted, automatically uses the first active subscription for the customer', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                // subscriptionId intentionally omitted
                quantity: 1,
              },
            },
            transaction
          )
        })
      ).unwrap()

      expect(result.claims.length).toBe(1)
      expect(result.claims[0].subscriptionId).toBe(subscription.id)
    })

    it('when subscriptionId is omitted and no active subscription exists, throws an error', async () => {
      // Cancel the subscription
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateSubscription(
            {
              id: subscription.id,
              status: SubscriptionStatus.Canceled,
              canceledAt: Date.now(),
              renews: true,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await claimResourceTransaction(
          {
            organizationId: organization.id,
            customerId: customer.id,
            input: {
              resourceSlug: 'seats',
              // subscriptionId intentionally omitted
              quantity: 1,
            },
          },
          transaction
        )
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'No active subscription found'
        )
      }
    })
  })

  describe('releaseResourceTransaction - additional coverage', () => {
    it('when externalIds array is provided, releases all matching named claims and returns accurate usage', async () => {
      // Create 3 named claims
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalIds: ['user_1', 'user_2', 'user_3'],
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Release 2 of the 3 claims
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await releaseResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: 'seats',
                  subscriptionId: subscription.id,
                  externalIds: ['user_1', 'user_3'],
                },
              },
              transaction
            )
          )
        })
      ).unwrap()

      expect(result.releasedClaims.length).toBe(2)
      expect(
        result.releasedClaims.map((c) => c.externalId).sort()
      ).toEqual(['user_1', 'user_3'].sort())
      expect(result.usage).toMatchObject({
        resourceSlug: 'seats',
        capacity: 5,
        claimed: 1,
        available: 4,
      })
      expect(result.usage.resourceId).toBe(resource.id)

      // Verify user_2 is still active
      const activeClaims = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(activeClaims.length).toBe(1)
      expect(activeClaims[0].externalId).toBe('user_2')
    })

    it('when releasing with externalIds array and one externalId is not found, throws an error', async () => {
      // Create only 2 named claims
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalIds: ['user_1', 'user_2'],
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Try to release 3 claims, including one that doesn't exist
      const result = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await releaseResourceTransaction(
          {
            organizationId: organization.id,
            customerId: customer.id,
            input: {
              resourceSlug: 'seats',
              subscriptionId: subscription.id,
              externalIds: ['user_1', 'user_2', 'nonexistent_user'],
            },
          },
          transaction
        )
        return Result.ok(undefined)
      })
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'No active claim found with externalId'
        )
      }
    })
  })
})

describe('getResourceUsageInputSchema', () => {
  it('parses successfully when only resourceSlug is provided', () => {
    const result = getResourceUsageInputSchema.safeParse({
      resourceSlug: 'seats',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      resourceSlug: 'seats',
    })
  })

  it('parses successfully when only resourceId is provided', () => {
    const result = getResourceUsageInputSchema.safeParse({
      resourceId: 'res_123',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      resourceId: 'res_123',
    })
  })

  it('parses successfully when resourceSlug and optional subscriptionId are provided', () => {
    const result = getResourceUsageInputSchema.safeParse({
      resourceSlug: 'seats',
      subscriptionId: 'sub_456',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      resourceSlug: 'seats',
      subscriptionId: 'sub_456',
    })
  })

  it('parses successfully when resourceId and optional subscriptionId are provided', () => {
    const result = getResourceUsageInputSchema.safeParse({
      resourceId: 'res_123',
      subscriptionId: 'sub_456',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      resourceId: 'res_123',
      subscriptionId: 'sub_456',
    })
  })

  it('rejects when both resourceSlug and resourceId are provided', () => {
    const result = getResourceUsageInputSchema.safeParse({
      resourceSlug: 'seats',
      resourceId: 'res_123',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe(
      'Exactly one of resourceSlug or resourceId must be provided'
    )
  })

  it('rejects when neither resourceSlug nor resourceId is provided', () => {
    const result = getResourceUsageInputSchema.safeParse({})

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe(
      'Exactly one of resourceSlug or resourceId must be provided'
    )
  })

  it('rejects when only subscriptionId is provided without resource identifier', () => {
    const result = getResourceUsageInputSchema.safeParse({
      subscriptionId: 'sub_456',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe(
      'Exactly one of resourceSlug or resourceId must be provided'
    )
  })
})

describe('expired_at functionality', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let customer: Customer.Record
  let resource: Resource.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record
  let subscriptionItemFeature: SubscriptionItemFeature.ResourceRecord

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    resource = await setupResource({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      slug: 'seats',
      name: 'Seats',
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test-expired@test.com',
      livemode: true,
    })

    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    const product = await setupProduct({
      organizationId: organization.id,
      name: 'Test Product',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Resource Subscription Item',
      quantity: 1,
      unitPrice: 1000,
    })

    // Create a Resource feature with capacity of 5
    const resourceFeature = (
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await insertFeature(
            {
              organizationId: organization.id,
              pricingModelId: pricingModel.id,
              type: FeatureType.Resource,
              name: 'Seats Feature',
              slug: 'seats-feature',
              description: 'Resource feature for seats',
              amount: 5,
              usageMeterId: null,
              renewalFrequency: null,
              resourceId: resource.id,
              livemode: true,
              active: true,
            },
            ctx
          )
        )
      })
    ).unwrap()

    subscriptionItemFeature =
      await setupResourceSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: resourceFeature.id,
        resourceId: resource.id,
        pricingModelId: pricingModel.id,
        amount: 5,
      })
  })

  describe('expired claims filtering', () => {
    it('selectActiveResourceClaims excludes claims with expiredAt in the past', async () => {
      // Create a claim that has already expired (1 hour ago)
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'expired-user',
        expiredAt: oneHourAgo,
      })

      // Create an active claim (no expiration)
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'active-user',
        expiredAt: null,
      })

      // Create a claim that expires in the future
      const oneHourFromNow = Date.now() + 60 * 60 * 1000
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'future-expiry-user',
        expiredAt: oneHourFromNow,
      })

      const activeClaims = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Only active and future-expiry claims should be returned
      expect(activeClaims.length).toBe(2)
      expect(activeClaims.map((c) => c.externalId).sort()).toEqual(
        ['active-user', 'future-expiry-user'].sort()
      )
    })

    it('countActiveResourceClaims excludes claims with expiredAt in the past', async () => {
      // Create 2 expired claims
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'expired-1',
        expiredAt: oneHourAgo,
      })
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'expired-2',
        expiredAt: oneHourAgo,
      })

      // Create 3 active claims
      for (let i = 0; i < 3; i++) {
        await setupResourceClaim({
          organizationId: organization.id,
          resourceId: resource.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: `active-${i}`,
          expiredAt: null,
        })
      }

      const count = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await countActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Only 3 active claims should be counted
      expect(count).toBe(3)
    })

    it('getResourceUsage excludes expired claims from claimed count', async () => {
      // Create 2 expired claims
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'expired-1',
        expiredAt: oneHourAgo,
      })
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'expired-2',
        expiredAt: oneHourAgo,
      })

      // Create 2 active claims
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'active-1',
        expiredAt: null,
      })
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'active-2',
        expiredAt: null,
      })

      const usage = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
          )
        })
      ).unwrap()

      expect(usage).toEqual({
        capacity: 5,
        claimed: 2, // Only active claims
        available: 3,
      })
    })
  })

  describe('temporary claims during interim period', () => {
    it('when subscription has cancelScheduledAt in the future and claims exceed future capacity, sets expiredAt on claims', async () => {
      // First, create 2 existing claims (within future capacity of 0 after cancellation)
      // Actually, future capacity is 0, so all claims should be temporary
      // Let's schedule cancellation in 7 days
      const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateSubscription(
            {
              id: subscription.id,
              cancelScheduledAt: sevenDaysFromNow,
              renews: false,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // Now claim a resource
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 2,
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Both claims should be temporary because future capacity is 0
      expect(result.claims.length).toBe(2)
      expect(result.claims.every((c) => c.expiredAt !== null)).toBe(
        true
      )
      // expiredAt should be set to cancelScheduledAt
      expect(
        result.claims.every((c) => c.expiredAt === sevenDaysFromNow)
      ).toBe(true)

      // temporaryClaims info should be populated
      expect(result.temporaryClaims).not.toBe(undefined)
      expect(result.temporaryClaims!.claimIds.length).toBe(2)
      expect(result.temporaryClaims!.expiresAt).toBe(sevenDaysFromNow)
      expect(result.temporaryClaims!.reason).toContain('cancellation')
    })

    it('when no scheduled change exists, claims are created without expiredAt', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 2,
              },
            },
            transaction
          )
        })
      ).unwrap()

      expect(result.claims.length).toBe(2)
      expect(result.claims.every((c) => c.expiredAt === null)).toBe(
        true
      )
      expect(result.temporaryClaims).toBeUndefined()
    })

    it('when cancelScheduledAt is in the past (already passed), claims are created normally without expiredAt', async () => {
      // Set cancelScheduledAt in the past (should have already executed)
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateSubscription(
            {
              id: subscription.id,
              cancelScheduledAt: oneHourAgo,
              renews: false,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                quantity: 1,
              },
            },
            transaction
          )
        })
      ).unwrap()

      // Since cancelScheduledAt is in the past, it shouldn't affect new claims
      expect(result.claims.length).toBe(1)
      expect(result.claims[0].expiredAt).toBe(null)
      expect(result.temporaryClaims).toBeUndefined()
    })
  })

  describe('releaseExpiredResourceClaims', () => {
    it('releases claims that have expired and sets releaseReason to expired', async () => {
      // Create 2 expired claims
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      const expiredClaim1 = await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'expired-1',
        expiredAt: oneHourAgo,
      })
      const expiredClaim2 = await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'expired-2',
        expiredAt: oneHourAgo,
      })

      // Create 1 active claim (no expiration)
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'active-1',
        expiredAt: null,
      })

      // Create 1 claim that expires in the future
      const oneHourFromNow = Date.now() + 60 * 60 * 1000
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'future-expiry',
        expiredAt: oneHourFromNow,
      })

      // Release expired claims
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await releaseExpiredResourceClaims(
              subscription.id,
              transaction
            )
          )
        })
      ).unwrap()

      // Only the 2 expired claims should have been released
      expect(result.releasedCount).toBe(2)

      // Verify remaining active claims
      const activeClaims = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Only active and future-expiry claims remain
      expect(activeClaims.length).toBe(2)
      expect(activeClaims.map((c) => c.externalId).sort()).toEqual(
        ['active-1', 'future-expiry'].sort()
      )
    })

    it('returns releasedCount of 0 when there are no expired claims', async () => {
      // Create only active claims
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'active-1',
        expiredAt: null,
      })

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await releaseExpiredResourceClaims(
              subscription.id,
              transaction
            )
          )
        })
      ).unwrap()

      expect(result.releasedCount).toBe(0)
    })
  })
})
