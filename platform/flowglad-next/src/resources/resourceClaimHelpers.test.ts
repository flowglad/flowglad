import { beforeEach, describe, expect, it } from 'vitest'
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
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Resource } from '@/db/schema/resources'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { insertFeature } from '@/db/tableMethods/featureMethods'
import { selectActiveResourceClaims } from '@/db/tableMethods/resourceClaimMethods'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import {
  FeatureType,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import {
  claimResourceTransaction,
  getResourceUsage,
  getResourceUsageInputSchema,
  releaseAllResourceClaimsForSubscription,
  releaseAllResourceClaimsForSubscriptionItemFeature,
  releaseResourceTransaction,
  validateResourceCapacityForDowngrade,
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
    const resourceFeature = await adminTransaction(
      async ({ transaction }) => {
        return insertFeature(
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
          transaction
        )
      }
    )

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
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: subscription.id,
            status: SubscriptionStatus.Canceled,
            canceledAt: Date.now(),
            renews: true,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
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
      ).rejects.toThrow('is not active')
    })

    it('when capacity is exhausted, throws an error indicating no available capacity', async () => {
      // Create 5 claims to exhaust the capacity
      for (let i = 0; i < 5; i++) {
        await setupResourceClaim({
          organizationId: organization.id,
          subscriptionItemFeatureId: subscriptionItemFeature.id,
          resourceId: resource.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: `user-${i}`,
        })
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
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
      ).rejects.toThrow('No available capacity')
    })

    it('when quantity is provided, creates that many anonymous claims with externalId=null and returns accurate usage', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
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
        }
      )

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
      const result = await adminTransaction(
        async ({ transaction }) => {
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
        }
      )

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
      const firstResult = await adminTransaction(
        async ({ transaction }) => {
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
        }
      )

      // Attempt to claim again with same externalId
      const secondResult = await adminTransaction(
        async ({ transaction }) => {
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
        }
      )

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
      await adminTransaction(async ({ transaction }) => {
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

      // Now claim with multiple externalIds including the existing one
      const result = await adminTransaction(
        async ({ transaction }) => {
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
        }
      )

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
  })

  describe('releaseResourceTransaction', () => {
    it('when quantity is provided, releases only anonymous claims (FIFO) and ignores named claims', async () => {
      // Create 3 anonymous claims
      await adminTransaction(async ({ transaction }) => {
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

      // Create 2 named claims
      await adminTransaction(async ({ transaction }) => {
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

      // Release 2 anonymous claims
      const result = await adminTransaction(
        async ({ transaction }) => {
          return releaseResourceTransaction(
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
        }
      )

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
      const activeClaims = await adminTransaction(
        async ({ transaction }) => {
          return selectActiveResourceClaims(
            { subscriptionItemFeatureId: subscriptionItemFeature.id },
            transaction
          )
        }
      )
      const namedClaims = activeClaims.filter(
        (c) => c.externalId !== null
      )
      expect(namedClaims.length).toBe(2)
    })

    it('when trying to release more anonymous claims than exist, throws an error', async () => {
      // Create only 2 anonymous claims
      await adminTransaction(async ({ transaction }) => {
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

      // Try to release 3
      await expect(
        adminTransaction(async ({ transaction }) => {
          return releaseResourceTransaction(
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
      ).rejects.toThrow(
        'Cannot release 3 anonymous claims. Only 2 exist. Use claimIds to release specific claims regardless of type.'
      )
    })

    it('when externalId is provided, releases the specific named claim and sets releaseReason to released', async () => {
      // Create a named claim
      await adminTransaction(async ({ transaction }) => {
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

      const result = await adminTransaction(
        async ({ transaction }) => {
          return releaseResourceTransaction(
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
        }
      )

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
      await expect(
        adminTransaction(async ({ transaction }) => {
          return releaseResourceTransaction(
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
        })
      ).rejects.toThrow('No active claim found with externalId')
    })

    it('when claimIds are provided, releases those specific claims regardless of type', async () => {
      // Create mixed claims
      const anonymousResult = await adminTransaction(
        async ({ transaction }) => {
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
        }
      )

      const namedResult = await adminTransaction(
        async ({ transaction }) => {
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
        }
      )

      // Release one anonymous and one named by ID
      const claimIdsToRelease = [
        anonymousResult.claims[0].id,
        namedResult.claims[0].id,
      ]

      const result = await adminTransaction(
        async ({ transaction }) => {
          return releaseResourceTransaction(
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
        }
      )

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

  describe('validateResourceCapacityForDowngrade', () => {
    it('when active claims are less than or equal to new capacity, passes validation without error', async () => {
      // Create 2 claims
      await adminTransaction(async ({ transaction }) => {
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

      // Validate downgrade to capacity of 3 (greater than 2 claims) - should pass
      await adminTransaction(async ({ transaction }) => {
        await validateResourceCapacityForDowngrade(
          subscription.id,
          subscriptionItemFeature.id,
          3,
          transaction
        )
      })

      // Validate downgrade to capacity of 2 (equal to claims) - should pass
      await adminTransaction(async ({ transaction }) => {
        await validateResourceCapacityForDowngrade(
          subscription.id,
          subscriptionItemFeature.id,
          2,
          transaction
        )
      })
      // If we reach here without throwing, validation passed
    })

    it('when active claims exceed new capacity, throws an error with release instructions', async () => {
      // Create 5 claims
      await adminTransaction(async ({ transaction }) => {
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

      // Try to downgrade to capacity of 3
      await expect(
        adminTransaction(async ({ transaction }) => {
          return validateResourceCapacityForDowngrade(
            subscription.id,
            subscriptionItemFeature.id,
            3,
            transaction
          )
        })
      ).rejects.toThrow('Cannot reduce capacity to 3')
    })
  })

  describe('releaseAllResourceClaimsForSubscription', () => {
    it('releases all active claims for a subscription with the given reason, including both anonymous and named claims', async () => {
      // Create mixed claims: 3 anonymous + 2 named = 5 total
      await adminTransaction(async ({ transaction }) => {
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

      await adminTransaction(async ({ transaction }) => {
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

      // Release all claims
      const result = await adminTransaction(
        async ({ transaction }) => {
          return releaseAllResourceClaimsForSubscription(
            subscription.id,
            'subscription_canceled',
            transaction
          )
        }
      )

      expect(result.releasedCount).toBe(5)

      // Verify all claims are released
      const activeClaims = await adminTransaction(
        async ({ transaction }) => {
          return selectActiveResourceClaims(
            { subscriptionId: subscription.id },
            transaction
          )
        }
      )
      expect(activeClaims.length).toBe(0)
    })

    it('when there are no active claims, returns releasedCount of 0', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return releaseAllResourceClaimsForSubscription(
            subscription.id,
            'subscription_canceled',
            transaction
          )
        }
      )

      expect(result.releasedCount).toBe(0)
    })
  })

  describe('releaseAllResourceClaimsForSubscriptionItemFeature', () => {
    it('releases all active claims for a subscription item feature with the given reason and returns accurate count', async () => {
      // Create mixed claims: 2 anonymous + 2 named = 4 total
      await adminTransaction(async ({ transaction }) => {
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

      await adminTransaction(async ({ transaction }) => {
        return claimResourceTransaction(
          {
            organizationId: organization.id,
            customerId: customer.id,
            input: {
              resourceSlug: 'seats',
              subscriptionId: subscription.id,
              externalIds: ['feature_user_1', 'feature_user_2'],
            },
          },
          transaction
        )
      })

      // Release all claims for the subscription item feature
      const result = await adminTransaction(
        async ({ transaction }) => {
          return releaseAllResourceClaimsForSubscriptionItemFeature(
            subscriptionItemFeature.id,
            'feature_removed',
            transaction
          )
        }
      )

      expect(result.releasedCount).toBe(4)

      // Verify all claims are released
      const activeClaims = await adminTransaction(
        async ({ transaction }) => {
          return selectActiveResourceClaims(
            {
              subscriptionItemFeatureId: subscriptionItemFeature.id,
            },
            transaction
          )
        }
      )
      expect(activeClaims.length).toBe(0)
    })

    it('when there are no active claims, returns releasedCount of 0', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return releaseAllResourceClaimsForSubscriptionItemFeature(
            subscriptionItemFeature.id,
            'feature_removed',
            transaction
          )
        }
      )

      expect(result.releasedCount).toBe(0)
    })
  })

  describe('getResourceUsage', () => {
    it('returns accurate capacity, claimed count, and available slots', async () => {
      // Create 3 claims
      await adminTransaction(async ({ transaction }) => {
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

      const usage = await adminTransaction(
        async ({ transaction }) => {
          return getResourceUsage(
            subscription.id,
            subscriptionItemFeature.id,
            transaction
          )
        }
      )

      expect(usage).toEqual({
        capacity: 5,
        claimed: 3,
        available: 2,
      })
    })

    it('when no claims exist, returns full capacity as available', async () => {
      const usage = await adminTransaction(
        async ({ transaction }) => {
          return getResourceUsage(
            subscription.id,
            subscriptionItemFeature.id,
            transaction
          )
        }
      )

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
      await adminTransaction(async ({ transaction }) => {
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

      await adminTransaction(async ({ transaction }) => {
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

      // Fetch claims using array-based resourceId filtering (as the router does)
      const claims = await adminTransaction(
        async ({ transaction }) => {
          return selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: [resource.id],
            },
            transaction
          )
        }
      )

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
      const claims = await adminTransaction(
        async ({ transaction }) => {
          return selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: [resource.id],
            },
            transaction
          )
        }
      )

      expect(claims).toEqual([])
    })
  })

  describe('claimResourceTransaction - additional coverage', () => {
    it('when metadata is provided, persists metadata to the created claims', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
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
        }
      )

      expect(result.claims.length).toBe(1)
      expect(result.claims[0].metadata).toEqual({
        team: 'engineering',
        role: 'admin',
      })
    })

    it('when subscriptionId is omitted, automatically uses the first active subscription for the customer', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
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
        }
      )

      expect(result.claims.length).toBe(1)
      expect(result.claims[0].subscriptionId).toBe(subscription.id)
    })

    it('when subscriptionId is omitted and no active subscription exists, throws an error', async () => {
      // Cancel the subscription
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: subscription.id,
            status: SubscriptionStatus.Canceled,
            canceledAt: Date.now(),
            renews: true,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
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
      ).rejects.toThrow('No active subscription found')
    })
  })

  describe('releaseResourceTransaction - additional coverage', () => {
    it('when externalIds array is provided, releases all matching named claims and returns accurate usage', async () => {
      // Create 3 named claims
      await adminTransaction(async ({ transaction }) => {
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

      // Release 2 of the 3 claims
      const result = await adminTransaction(
        async ({ transaction }) => {
          return releaseResourceTransaction(
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
        }
      )

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
      const activeClaims = await adminTransaction(
        async ({ transaction }) => {
          return selectActiveResourceClaims(
            { subscriptionItemFeatureId: subscriptionItemFeature.id },
            transaction
          )
        }
      )
      expect(activeClaims.length).toBe(1)
      expect(activeClaims[0].externalId).toBe('user_2')
    })

    it('when releasing with externalIds array and one externalId is not found, throws an error', async () => {
      // Create only 2 named claims
      await adminTransaction(async ({ transaction }) => {
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

      // Try to release 3 claims, including one that doesn't exist
      await expect(
        adminTransaction(async ({ transaction }) => {
          return releaseResourceTransaction(
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
        })
      ).rejects.toThrow('No active claim found with externalId')
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
