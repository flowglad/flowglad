import { beforeEach, describe, expect, it } from 'bun:test'
import { IntervalUnit, PriceType } from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { ResourceClaim } from '@db-core/schema/resourceClaims'
import type { Resource } from '@db-core/schema/resources'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupResource,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import {
  countActiveResourceClaims,
  countActiveResourceClaimsBatch,
  insertResourceClaim,
  releaseResourceClaim,
  selectActiveClaimByExternalId,
  selectActiveResourceClaims,
  selectResourceClaimById,
  selectResourceClaims,
} from './resourceClaimMethods'

describe('resourceClaimMethods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let resource: Resource.Record
  let subscription: Subscription.Record

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

    await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Resource Subscription Item',
      quantity: 1,
      unitPrice: 1000,
    })
  })

  const createResourceClaimInsert = (params?: {
    externalId?: string | null
    metadata?: Record<string, string | number | boolean> | null
  }): ResourceClaim.Insert => ({
    organizationId: organization.id,
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
        await adminTransactionWithResult(async ({ transaction }) => {
          const inserted = await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'pet-1' }),
            transaction
          )

          expect(inserted.id).toMatch(/^res_claim_/)
          expect(inserted.organizationId).toBe(organization.id)
          expect(inserted.resourceId).toBe(resource.id)
          expect(inserted.subscriptionId).toBe(subscription.id)
          expect(inserted.pricingModelId).toBe(pricingModel.id)
          expect(inserted.externalId).toBe('pet-1')
          expect(inserted.livemode).toBe(true)
          expect(inserted.releasedAt).toBeNull()
          expect(inserted.releaseReason).toBeNull()
          // claimedAt should be a valid timestamp (not null, positive number)
          // Note: In transaction-isolated tests, database now() returns transaction start time,
          // not wall clock time, so we can't compare against Date.now()
          expect(typeof inserted.claimedAt).toBe('number')
          expect(inserted.claimedAt).toBeGreaterThan(0)
          // Verify it's a reasonable timestamp (after year 2020)
          expect(inserted.claimedAt).toBeGreaterThan(1577836800000)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should select a resource claim by id and return the same record', async () => {
      const inserted = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await insertResourceClaim(
              createResourceClaimInsert({ externalId: 'pet-2' }),
              transaction
            )
          )
        })
      ).unwrap()

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const selected = (
            await selectResourceClaimById(inserted.id, transaction)
          ).unwrap()

          expect(selected.id).toBe(inserted.id)
          expect(selected.externalId).toBe('pet-2')
          expect(selected.resourceId).toBe(resource.id)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('countActiveResourceClaims', () => {
    it('returns 0 when no claims exist for the subscription+resource', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const count = await countActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
          expect(count).toBe(0)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('returns correct count of active claims, excluding released claims', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Insert 3 claims
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
          const initialCount = await countActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
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
          const finalCount = await countActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
          expect(finalCount).toBe(2)

          // Verify selectActiveResourceClaims also returns only 2
          const activeClaims = await selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
          expect(activeClaims.length).toBe(2)
          expect(
            activeClaims.every((c) => c.releasedAt === null)
          ).toBe(true)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('only counts claims for the specified subscription and resource', async () => {
      // Create a second resource for the same org
      const resource2 = await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'projects',
        name: 'Projects',
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Create claims for the first resource
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'seat-1' }),
            transaction
          )
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'seat-2' }),
            transaction
          )

          // Create a claim for the second resource
          await insertResourceClaim(
            {
              organizationId: organization.id,
              resourceId: resource2.id,
              subscriptionId: subscription.id,
              pricingModelId: pricingModel.id,
              externalId: 'project-1',
              metadata: null,
              livemode: true,
            },
            transaction
          )

          // Count should only include claims for the specified resource
          const seatCount = await countActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
          expect(seatCount).toBe(2)

          const projectCount = await countActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource2.id,
            },
            transaction
          )
          expect(projectCount).toBe(1)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('selectActiveResourceClaims and selectResourceClaims', () => {
    it('returns all claims (active and released) from selectResourceClaims, but only active from selectActiveResourceClaims', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
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
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
          expect(allClaims.length).toBe(2)

          // selectActiveResourceClaims returns only active
          const activeClaims = await selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
          expect(activeClaims.length).toBe(1)
          expect(activeClaims[0].externalId).toBe('claim-a')
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('external_id uniqueness for active claims', () => {
    it('should enforce external_id uniqueness for active claims on the same resource and subscription', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Create first claim with external_id 'user-123'
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'user-123' }),
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // Attempting to create another active claim with same external_id should fail
      await expect(
        adminTransactionWithResult(async ({ transaction }) => {
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'user-123' }),
            transaction
          )
          return Result.ok(undefined)
        })
      ).rejects.toThrow()
    })

    it('should allow reusing external_id after the claim is released', async () => {
      // Create and release first claim
      const releasedClaim = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const claim = await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'recycled-id' }),
            transaction
          )
          return Result.ok(
            await releaseResourceClaim(
              { id: claim.id, releaseReason: 'Reassignment' },
              transaction
            )
          )
        })
      ).unwrap()

      // Verify the claim is released
      expect(typeof releasedClaim.releasedAt).toBe('number')
      expect(releasedClaim.releaseReason).toBe('Reassignment')

      // Now we should be able to create a new claim with the same external_id
      const newClaim = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await insertResourceClaim(
              createResourceClaimInsert({
                externalId: 'recycled-id',
              }),
              transaction
            )
          )
        })
      ).unwrap()

      expect(newClaim.externalId).toBe('recycled-id')
      expect(newClaim.releasedAt).toBeNull()
      expect(newClaim.id).not.toBe(releasedClaim.id)
    })

    it('should allow different external_ids for active claims on the same resource and subscription', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
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
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should allow null external_id for multiple active claims', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
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
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('selectActiveClaimByExternalId', () => {
    it('should find an active claim by externalId for the given resource and subscription', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
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
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return null when no active claim exists with the given externalId', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const found = await selectActiveClaimByExternalId(
            {
              resourceId: resource.id,
              subscriptionId: subscription.id,
              externalId: 'nonexistent',
            },
            transaction
          )

          expect(found).toBeNull()
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should not return released claims when searching by externalId', async () => {
      // Create and release a claim
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const claim = await insertResourceClaim(
            createResourceClaimInsert({
              externalId: 'released-claim',
            }),
            transaction
          )
          await releaseResourceClaim({ id: claim.id }, transaction)
          return Result.ok(undefined)
        })
      ).unwrap()

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const found = await selectActiveClaimByExternalId(
            {
              resourceId: resource.id,
              subscriptionId: subscription.id,
              externalId: 'released-claim',
            },
            transaction
          )

          expect(found).toBeNull()
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('releaseResourceClaim', () => {
    it('should release a claim by setting releasedAt timestamp and optional reason', async () => {
      const claim = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await insertResourceClaim(
              createResourceClaimInsert({ externalId: 'to-release' }),
              transaction
            )
          )
        })
      ).unwrap()

      const beforeRelease = Date.now()
      const releasedClaim = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await releaseResourceClaim(
              {
                id: claim.id,
                releaseReason: 'Subscription cancelled',
              },
              transaction
            )
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
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await insertResourceClaim(
              createResourceClaimInsert({ externalId: 'no-reason' }),
              transaction
            )
          )
        })
      ).unwrap()

      const releasedClaim = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await releaseResourceClaim({ id: claim.id }, transaction)
          )
        })
      ).unwrap()

      expect(typeof releasedClaim.releasedAt).toBe('number')
      expect(releasedClaim.releaseReason).toBeNull()
    })
  })

  describe('countActiveResourceClaimsBatch', () => {
    it('returns counts for multiple resources in a single query', async () => {
      // Create additional resources
      const resource2 = await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'projects',
        name: 'Projects',
      })
      const resource3 = await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'teams',
        name: 'Teams',
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Create 2 claims for resource 1
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'seat-1' }),
            transaction
          )
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'seat-2' }),
            transaction
          )

          // Create 3 claims for resource 2
          await insertResourceClaim(
            {
              organizationId: organization.id,
              resourceId: resource2.id,
              subscriptionId: subscription.id,
              pricingModelId: pricingModel.id,
              externalId: 'project-1',
              metadata: null,
              livemode: true,
            },
            transaction
          )
          await insertResourceClaim(
            {
              organizationId: organization.id,
              resourceId: resource2.id,
              subscriptionId: subscription.id,
              pricingModelId: pricingModel.id,
              externalId: 'project-2',
              metadata: null,
              livemode: true,
            },
            transaction
          )
          await insertResourceClaim(
            {
              organizationId: organization.id,
              resourceId: resource2.id,
              subscriptionId: subscription.id,
              pricingModelId: pricingModel.id,
              externalId: 'project-3',
              metadata: null,
              livemode: true,
            },
            transaction
          )

          // Create 1 claim for resource 3
          await insertResourceClaim(
            {
              organizationId: organization.id,
              resourceId: resource3.id,
              subscriptionId: subscription.id,
              pricingModelId: pricingModel.id,
              externalId: 'team-1',
              metadata: null,
              livemode: true,
            },
            transaction
          )

          // Batch count all resources
          const counts = await countActiveResourceClaimsBatch(
            {
              subscriptionId: subscription.id,
              resourceIds: [resource.id, resource2.id, resource3.id],
            },
            transaction
          )

          expect(counts.get(resource.id)).toBe(2)
          expect(counts.get(resource2.id)).toBe(3)
          expect(counts.get(resource3.id)).toBe(1)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('returns 0 for resources with no claims', async () => {
      const resource2 = await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'projects',
        name: 'Projects',
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Create claims only for resource 1
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'seat-1' }),
            transaction
          )

          // Batch count both resources
          const counts = await countActiveResourceClaimsBatch(
            {
              subscriptionId: subscription.id,
              resourceIds: [resource.id, resource2.id],
            },
            transaction
          )

          expect(counts.get(resource.id)).toBe(1)
          expect(counts.get(resource2.id)).toBe(0)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('returns empty map when resourceIds array is empty', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const counts = await countActiveResourceClaimsBatch(
            {
              subscriptionId: subscription.id,
              resourceIds: [],
            },
            transaction
          )

          expect(counts.size).toBe(0)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('excludes released claims from the count', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Create 3 claims
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'seat-1' }),
            transaction
          )
          const claimToRelease = await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'seat-2' }),
            transaction
          )
          await insertResourceClaim(
            createResourceClaimInsert({ externalId: 'seat-3' }),
            transaction
          )

          // Release one claim
          await releaseResourceClaim(
            { id: claimToRelease.id, releaseReason: 'Released' },
            transaction
          )

          // Batch count should only include active claims
          const counts = await countActiveResourceClaimsBatch(
            {
              subscriptionId: subscription.id,
              resourceIds: [resource.id],
            },
            transaction
          )

          expect(counts.get(resource.id)).toBe(2)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })
})
