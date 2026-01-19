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
  releaseAllClaimsForSubscriptionItemFeature,
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
    const resourceFeature = (
      await adminTransaction(async ({ transaction }) => {
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
      ;(
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
      ).unwrap()
    })

    it('should select a resource claim by id and return the same record', async () => {
      const inserted = (
        await adminTransaction(async ({ transaction }) => {
          return insertResourceClaim(
            createResourceClaimInsert({ externalId: 'pet-2' }),
            transaction
          )
        })
      ).unwrap()

      ;(
        await adminTransaction(async ({ transaction }) => {
          const selected = await selectResourceClaimById(
            inserted.id,
            transaction
          )

          expect(selected.id).toBe(inserted.id)
          expect(selected.externalId).toBe('pet-2')
          expect(selected.resourceId).toBe(resource.id)
        })
      ).unwrap()
    })
  })

  describe('selectActiveResourceClaims and countActiveClaimsForSubscriptionItemFeature', () => {
    it('should count only active claims where releasedAt IS NULL', async () => {
      ;(
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
            {
              id: claimToRelease.id,
              releaseReason: 'User unassigned',
            },
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
          expect(
            activeClaims.every((c) => c.releasedAt === null)
          ).toBe(true)
        })
      ).unwrap()
    })

    it('should return all claims (active and released) from selectResourceClaims', async () => {
      ;(
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
      ).unwrap()
    })
  })

  describe('external_id uniqueness for active claims', () => {
    it('should enforce external_id uniqueness for active claims on the same resource and subscription', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create first claim with external_id 'user-123'
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'user-123' }),
            transaction
          )
        })
      ).unwrap()

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
      const releasedClaim = (
        await adminTransaction(async ({ transaction }) => {
          const claim = await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'recycled-id' }),
            transaction
          )
          return releaseResourceClaim(
            { id: claim.id, releaseReason: 'Reassignment' },
            transaction
          )
        })
      ).unwrap()

      // Verify the claim is released
      expect(typeof releasedClaim.releasedAt).toBe('number')
      expect(releasedClaim.releaseReason).toBe('Reassignment')

      // Now we should be able to create a new claim with the same external_id
      const newClaim = (
        await adminTransaction(async ({ transaction }) => {
          return insertResourceClaim(
            createResourceClaimInsert({ externalId: 'recycled-id' }),
            transaction
          )
        })
      ).unwrap()

      expect(newClaim.externalId).toBe('recycled-id')
      expect(newClaim.releasedAt).toBeNull()
      expect(newClaim.id).not.toBe(releasedClaim.id)
    })

    it('should allow different external_ids for active claims on the same resource and subscription', async () => {
      ;(
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
      ).unwrap()
    })

    it('should allow null external_id for multiple active claims', async () => {
      ;(
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
      ).unwrap()
    })
  })

  describe('selectActiveClaimByExternalId', () => {
    it('should find an active claim by externalId for the given resource and subscription', async () => {
      ;(
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

          expect(found).toMatchObject({ externalId: 'findable' })
          expect(found!.externalId).toBe('findable')
          expect(found!.releasedAt).toBeNull()
        })
      ).unwrap()
    })

    it('should return null when no active claim exists with the given externalId', async () => {
      ;(
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
      ).unwrap()
    })

    it('should not return released claims when searching by externalId', async () => {
      // Create and release a claim
      ;(
        await adminTransaction(async ({ transaction }) => {
          const claim = await insertResourceClaim(
            createResourceClaimInsert({
              externalId: 'released-claim',
            }),
            transaction
          )
          await releaseResourceClaim({ id: claim.id }, transaction)
        })
      ).unwrap()

      ;(
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
      ).unwrap()
    })
  })

  describe('releaseResourceClaim', () => {
    it('should release a claim by setting releasedAt timestamp and optional reason', async () => {
      const claim = (
        await adminTransaction(async ({ transaction }) => {
          return insertResourceClaim(
            createResourceClaimInsert({ externalId: 'to-release' }),
            transaction
          )
        })
      ).unwrap()

      const beforeRelease = Date.now()
      const releasedClaim = (
        await adminTransaction(async ({ transaction }) => {
          return releaseResourceClaim(
            { id: claim.id, releaseReason: 'Subscription cancelled' },
            transaction
          )
        })
      ).unwrap()

      expect(releasedClaim.id).toBe(claim.id)
      expect(releasedClaim.releasedAt).toBeGreaterThanOrEqual(
        beforeRelease
      )
      expect(releasedClaim.releaseReason).toBe(
        'Subscription cancelled'
      )
    })

    it('should release a claim without a reason', async () => {
      const claim = (
        await adminTransaction(async ({ transaction }) => {
          return insertResourceClaim(
            createResourceClaimInsert({ externalId: 'no-reason' }),
            transaction
          )
        })
      ).unwrap()

      const releasedClaim = (
        await adminTransaction(async ({ transaction }) => {
          return releaseResourceClaim({ id: claim.id }, transaction)
        })
      ).unwrap()

      expect(typeof releasedClaim.releasedAt).toBe('number')
      expect(releasedClaim.releaseReason).toBeNull()
    })
  })

  describe('releaseAllClaimsForSubscriptionItemFeature', () => {
    it('should release all active claims for a subscriptionItemFeatureId with provided reason', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create 3 active claims
          await insertResourceClaim(
            createResourceClaimInsert({
              externalId: 'bulk-release-1',
            }),
            transaction
          )
          await insertResourceClaim(
            createResourceClaimInsert({
              externalId: 'bulk-release-2',
            }),
            transaction
          )
          await insertResourceClaim(
            createResourceClaimInsert({
              externalId: 'bulk-release-3',
            }),
            transaction
          )

          // Verify we have 3 active claims
          const activeBeforeCount =
            await countActiveClaimsForSubscriptionItemFeature(
              subscriptionItemFeature.id,
              transaction
            )
          expect(activeBeforeCount).toBe(3)

          const beforeRelease = Date.now()

          // Release all claims
          const releasedClaims =
            await releaseAllClaimsForSubscriptionItemFeature(
              subscriptionItemFeature.id,
              'Feature detached from subscription',
              transaction
            )

          const afterRelease = Date.now()

          // All claims should be released
          expect(releasedClaims.length).toBe(3)
          for (const claim of releasedClaims) {
            expect(claim.releaseReason).toBe(
              'Feature detached from subscription'
            )
            expect(claim.releasedAt).toBeGreaterThanOrEqual(
              beforeRelease
            )
            expect(claim.releasedAt).toBeLessThanOrEqual(
              afterRelease + 1000
            )
          }

          // Verify no active claims remain
          const activeAfterCount =
            await countActiveClaimsForSubscriptionItemFeature(
              subscriptionItemFeature.id,
              transaction
            )
          expect(activeAfterCount).toBe(0)
        })
      ).unwrap()
    })

    it('should return empty array when no active claims exist for the subscriptionItemFeatureId', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Don't create any claims

          const releasedClaims =
            await releaseAllClaimsForSubscriptionItemFeature(
              subscriptionItemFeature.id,
              'Cleanup',
              transaction
            )

          expect(releasedClaims.length).toBe(0)
        })
      ).unwrap()
    })

    it('should only release active claims and not affect already-released claims', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create claims
          const claim1 = await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'active-claim' }),
            transaction
          )
          const claim2 = await insertResourceClaim(
            createResourceClaimInsert({
              externalId: 'already-released',
            }),
            transaction
          )

          // Release one claim manually first
          const manuallyReleased = await releaseResourceClaim(
            { id: claim2.id, releaseReason: 'Manually released' },
            transaction
          )
          const manualReleaseTime = manuallyReleased.releasedAt

          // Now bulk release - should only affect active claims
          const releasedClaims =
            await releaseAllClaimsForSubscriptionItemFeature(
              subscriptionItemFeature.id,
              'Bulk release',
              transaction
            )

          // Only the active claim should be in the result
          expect(releasedClaims.length).toBe(1)
          expect(releasedClaims[0].id).toBe(claim1.id)
          expect(releasedClaims[0].releaseReason).toBe('Bulk release')

          // Verify the manually released claim still has its original reason/timestamp
          const manuallyReleasedAfter = await selectResourceClaimById(
            claim2.id,
            transaction
          )
          expect(manuallyReleasedAfter.releaseReason).toBe(
            'Manually released'
          )
          expect(manuallyReleasedAfter.releasedAt).toBe(
            manualReleaseTime
          )
        })
      ).unwrap()
    })
  })
})
