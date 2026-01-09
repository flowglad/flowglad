import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupPricingModel,
  setupProduct,
  setupResource,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupToggleFeature,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { ResourceClaim } from '@/db/schema/resourceClaims'
import type { Resource } from '@/db/schema/resources'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { Subscription } from '@/db/schema/subscriptions'
import { FeatureType, IntervalUnit, PriceType } from '@/types'
import { insertFeature } from './featureMethods'
import {
  countActiveClaimsForSubscriptionItemFeature,
  insertResourceClaim,
  releaseResourceClaim,
  selectActiveClaimByExternalId,
  selectActiveResourceClaims,
  selectResourceClaimById,
  selectResourceClaims,
} from './resourceClaimMethods'
import { insertResource } from './resourceMethods'

describe('resourceClaimMethods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let resource: Resource.Record
  let subscription: Subscription.Record
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

    const customer = await setupCustomer({
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

    const subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Resource Subscription Item',
      quantity: 1,
      unitPrice: 1000,
    })

    // Create a Resource feature first
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

  const createResourceClaimInsert = (params?: {
    externalId?: string | null
    metadata?: Record<string, string | number | boolean> | null
  }): ResourceClaim.Insert => ({
    organizationId: organization.id,
    subscriptionItemFeatureId: subscriptionItemFeature.id,
    resourceId: resource.id,
    subscriptionId: subscription.id,
    pricingModelId: pricingModel.id,
    externalId: params?.externalId ?? null,
    metadata: params?.metadata ?? null,
    livemode: true,
  })

  describe('insertResourceClaim and selectResourceClaimById', () => {
    it('should insert a resource claim and return it with generated id and claimedAt timestamp', async () => {
      await adminTransaction(async ({ transaction }) => {
        const beforeInsert = Date.now()
        const inserted = await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'pet-1' }),
          transaction
        )
        const afterInsert = Date.now()

        expect(inserted.id).toMatch(/^res_claim_/)
        expect(inserted.organizationId).toBe(organization.id)
        expect(inserted.subscriptionItemFeatureId).toBe(
          subscriptionItemFeature.id
        )
        expect(inserted.resourceId).toBe(resource.id)
        expect(inserted.subscriptionId).toBe(subscription.id)
        expect(inserted.pricingModelId).toBe(pricingModel.id)
        expect(inserted.externalId).toBe('pet-1')
        expect(inserted.livemode).toBe(true)
        expect(inserted.releasedAt).toBeNull()
        expect(inserted.releaseReason).toBeNull()
        // claimedAt should be within reasonable range (within 5 seconds of the test)
        expect(inserted.claimedAt).toBeGreaterThanOrEqual(
          beforeInsert - 5000
        )
        expect(inserted.claimedAt).toBeLessThanOrEqual(
          afterInsert + 5000
        )
      })
    })

    it('should select a resource claim by id and return the same record', async () => {
      const inserted = await adminTransaction(
        async ({ transaction }) => {
          return insertResourceClaim(
            createResourceClaimInsert({ externalId: 'pet-2' }),
            transaction
          )
        }
      )

      await adminTransaction(async ({ transaction }) => {
        const selected = await selectResourceClaimById(
          inserted.id,
          transaction
        )

        expect(selected.id).toBe(inserted.id)
        expect(selected.externalId).toBe('pet-2')
        expect(selected.resourceId).toBe(resource.id)
      })
    })
  })

  describe('selectActiveResourceClaims and countActiveClaimsForSubscriptionItemFeature', () => {
    it('should count only active claims where releasedAt IS NULL', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Insert 3 active claims
        await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'active-1' }),
          transaction
        )
        await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'active-2' }),
          transaction
        )
        const claimToRelease = await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'to-release' }),
          transaction
        )

        // Verify initial count is 3
        const initialCount =
          await countActiveClaimsForSubscriptionItemFeature(
            subscriptionItemFeature.id,
            transaction
          )
        expect(initialCount).toBe(3)

        // Release one claim
        await releaseResourceClaim(
          { id: claimToRelease.id, releaseReason: 'User unassigned' },
          transaction
        )

        // Verify count is now 2
        const finalCount =
          await countActiveClaimsForSubscriptionItemFeature(
            subscriptionItemFeature.id,
            transaction
          )
        expect(finalCount).toBe(2)

        // Verify selectActiveResourceClaims also returns only 2
        const activeClaims = await selectActiveResourceClaims(
          { subscriptionItemFeatureId: subscriptionItemFeature.id },
          transaction
        )
        expect(activeClaims.length).toBe(2)
        expect(activeClaims.every((c) => c.releasedAt === null)).toBe(
          true
        )
      })
    })

    it('should return all claims (active and released) from selectResourceClaims', async () => {
      await adminTransaction(async ({ transaction }) => {
        await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'claim-a' }),
          transaction
        )
        const claimB = await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'claim-b' }),
          transaction
        )

        // Release claim B
        await releaseResourceClaim({ id: claimB.id }, transaction)

        // selectResourceClaims returns ALL claims
        const allClaims = await selectResourceClaims(
          { subscriptionItemFeatureId: subscriptionItemFeature.id },
          transaction
        )
        expect(allClaims.length).toBe(2)

        // selectActiveResourceClaims returns only active
        const activeClaims = await selectActiveResourceClaims(
          { subscriptionItemFeatureId: subscriptionItemFeature.id },
          transaction
        )
        expect(activeClaims.length).toBe(1)
        expect(activeClaims[0].externalId).toBe('claim-a')
      })
    })
  })

  describe('external_id uniqueness for active claims', () => {
    it('should enforce external_id uniqueness for active claims on the same resource and subscription', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create first claim with external_id 'user-123'
        await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'user-123' }),
          transaction
        )
      })

      // Attempting to create another active claim with same external_id should fail
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'user-123' }),
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should allow reusing external_id after the claim is released', async () => {
      // Create and release first claim
      const releasedClaim = await adminTransaction(
        async ({ transaction }) => {
          const claim = await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'recycled-id' }),
            transaction
          )
          return releaseResourceClaim(
            { id: claim.id, releaseReason: 'Reassignment' },
            transaction
          )
        }
      )

      // Verify the claim is released
      expect(releasedClaim.releasedAt).not.toBeNull()
      expect(releasedClaim.releaseReason).toBe('Reassignment')

      // Now we should be able to create a new claim with the same external_id
      const newClaim = await adminTransaction(
        async ({ transaction }) => {
          return insertResourceClaim(
            createResourceClaimInsert({ externalId: 'recycled-id' }),
            transaction
          )
        }
      )

      expect(newClaim.externalId).toBe('recycled-id')
      expect(newClaim.releasedAt).toBeNull()
      expect(newClaim.id).not.toBe(releasedClaim.id)
    })

    it('should allow different external_ids for active claims on the same resource and subscription', async () => {
      await adminTransaction(async ({ transaction }) => {
        const claim1 = await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'user-a' }),
          transaction
        )
        const claim2 = await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'user-b' }),
          transaction
        )

        expect(claim1.externalId).toBe('user-a')
        expect(claim2.externalId).toBe('user-b')
        expect(claim1.id).not.toBe(claim2.id)
      })
    })

    it('should allow null external_id for multiple active claims', async () => {
      await adminTransaction(async ({ transaction }) => {
        const claim1 = await insertResourceClaim(
          createResourceClaimInsert({ externalId: null }),
          transaction
        )
        const claim2 = await insertResourceClaim(
          createResourceClaimInsert({ externalId: null }),
          transaction
        )

        expect(claim1.externalId).toBeNull()
        expect(claim2.externalId).toBeNull()
        expect(claim1.id).not.toBe(claim2.id)
      })
    })
  })

  describe('selectActiveClaimByExternalId', () => {
    it('should find an active claim by externalId for the given resource and subscription', async () => {
      await adminTransaction(async ({ transaction }) => {
        await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'findable' }),
          transaction
        )

        const found = await selectActiveClaimByExternalId(
          {
            resourceId: resource.id,
            subscriptionId: subscription.id,
            externalId: 'findable',
          },
          transaction
        )

        expect(found).not.toBeNull()
        expect(found!.externalId).toBe('findable')
        expect(found!.releasedAt).toBeNull()
      })
    })

    it('should return null when no active claim exists with the given externalId', async () => {
      await adminTransaction(async ({ transaction }) => {
        const found = await selectActiveClaimByExternalId(
          {
            resourceId: resource.id,
            subscriptionId: subscription.id,
            externalId: 'nonexistent',
          },
          transaction
        )

        expect(found).toBeNull()
      })
    })

    it('should not return released claims when searching by externalId', async () => {
      // Create and release a claim
      await adminTransaction(async ({ transaction }) => {
        const claim = await insertResourceClaim(
          createResourceClaimInsert({ externalId: 'released-claim' }),
          transaction
        )
        await releaseResourceClaim({ id: claim.id }, transaction)
      })

      await adminTransaction(async ({ transaction }) => {
        const found = await selectActiveClaimByExternalId(
          {
            resourceId: resource.id,
            subscriptionId: subscription.id,
            externalId: 'released-claim',
          },
          transaction
        )

        expect(found).toBeNull()
      })
    })
  })

  describe('releaseResourceClaim', () => {
    it('should release a claim by setting releasedAt timestamp and optional reason', async () => {
      const claim = await adminTransaction(
        async ({ transaction }) => {
          return insertResourceClaim(
            createResourceClaimInsert({ externalId: 'to-release' }),
            transaction
          )
        }
      )

      const beforeRelease = Date.now()
      const releasedClaim = await adminTransaction(
        async ({ transaction }) => {
          return releaseResourceClaim(
            { id: claim.id, releaseReason: 'Subscription cancelled' },
            transaction
          )
        }
      )

      expect(releasedClaim.id).toBe(claim.id)
      expect(releasedClaim.releasedAt).toBeGreaterThanOrEqual(
        beforeRelease
      )
      expect(releasedClaim.releaseReason).toBe(
        'Subscription cancelled'
      )
    })

    it('should release a claim without a reason', async () => {
      const claim = await adminTransaction(
        async ({ transaction }) => {
          return insertResourceClaim(
            createResourceClaimInsert({ externalId: 'no-reason' }),
            transaction
          )
        }
      )

      const releasedClaim = await adminTransaction(
        async ({ transaction }) => {
          return releaseResourceClaim({ id: claim.id }, transaction)
        }
      )

      expect(releasedClaim.releasedAt).not.toBeNull()
      expect(releasedClaim.releaseReason).toBeNull()
    })
  })
})
