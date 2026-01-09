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
  releaseAllResourceClaimsForSubscription,
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
      expect(result.usage).toEqual({
        capacity: 5,
        claimed: 3,
        available: 2,
      })
    })

    it('when externalId is provided, creates a single non-anonymous claim with that externalId', async () => {
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
      expect(result.usage).toEqual({
        capacity: 5,
        claimed: 1,
        available: 4,
      })
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
      expect(secondResult.usage.claimed).toBe(1) // Not 2
    })

    it('when externalIds are provided, creates multiple non-anonymous claims, and existing claims are returned idempotently', async () => {
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
      expect(result.usage.claimed).toBe(3)
    })
  })

  describe('releaseResourceTransaction', () => {
    it('when quantity is provided, releases only anonymous claims (FIFO) and ignores non-anonymous claims', async () => {
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

      // Create 2 non-anonymous claims
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

      // Verify remaining claims: 1 anonymous + 2 non-anonymous = 3 total
      expect(result.usage.claimed).toBe(3)

      // Verify the non-anonymous claims are still active
      const activeClaims = await adminTransaction(
        async ({ transaction }) => {
          return selectActiveResourceClaims(
            { subscriptionItemFeatureId: subscriptionItemFeature.id },
            transaction
          )
        }
      )
      const nonAnonymousClaims = activeClaims.filter(
        (c) => c.externalId !== null
      )
      expect(nonAnonymousClaims.length).toBe(2)
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
      ).rejects.toThrow('Only 2 anonymous claims exist')
    })

    it('when externalId is provided, releases the specific non-anonymous claim and sets releaseReason to released', async () => {
      // Create a non-anonymous claim
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
      expect(result.usage.claimed).toBe(0)
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

      const nonAnonymousResult = await adminTransaction(
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

      // Release one anonymous and one non-anonymous by ID
      const claimIdsToRelease = [
        anonymousResult.claims[0].id,
        nonAnonymousResult.claims[0].id,
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
      expect(result.usage.claimed).toBe(1) // One anonymous claim remains
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
    it('releases all active claims for a subscription with the given reason, including both anonymous and non-anonymous claims', async () => {
      // Create mixed claims: 3 anonymous + 2 non-anonymous = 5 total
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
})
