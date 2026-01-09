import { beforeEach, describe, expect, it } from 'vitest'
import { setupOrg, setupPricingModel } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Resource } from '@/db/schema/resources'
import {
  insertResource,
  selectResourceById,
  selectResources,
  selectResourcesPaginated,
  updateResource,
  upsertResourceByPricingModelIdAndSlug,
} from './resourceMethods'

describe('resourceMethods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let secondPricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    secondPricingModel = await setupPricingModel({
      organizationId: organization.id,
      name: 'Second Pricing Model',
    })
  })

  const createResourceInsert = (params?: {
    slug?: string
    name?: string
    pricingModelId?: string
  }): Resource.Insert => ({
    organizationId: organization.id,
    pricingModelId: params?.pricingModelId ?? pricingModel.id,
    slug: params?.slug ?? 'seats',
    name: params?.name ?? 'Seats',
    description: 'User seats for the application',
    livemode: true,
    active: true,
  })

  describe('insertResource and selectResourceById', () => {
    it('should insert a resource and return it with generated id', async () => {
      await adminTransaction(async ({ transaction }) => {
        const inserted = await insertResource(
          createResourceInsert(),
          transaction
        )

        expect(inserted.id).toMatch(/^resource_/)
        expect(inserted.slug).toBe('seats')
        expect(inserted.name).toBe('Seats')
        expect(inserted.description).toBe(
          'User seats for the application'
        )
        expect(inserted.organizationId).toBe(organization.id)
        expect(inserted.pricingModelId).toBe(pricingModel.id)
        expect(inserted.active).toBe(true)
        expect(inserted.livemode).toBe(true)
      })
    })

    it('should select a resource by id and return the same record', async () => {
      const inserted = await adminTransaction(
        async ({ transaction }) => {
          return insertResource(createResourceInsert(), transaction)
        }
      )

      await adminTransaction(async ({ transaction }) => {
        const selected = await selectResourceById(
          inserted.id,
          transaction
        )

        expect(selected.id).toBe(inserted.id)
        expect(selected.slug).toBe(inserted.slug)
        expect(selected.name).toBe(inserted.name)
        expect(selected.pricingModelId).toBe(inserted.pricingModelId)
      })
    })

    it('should throw an error when selecting a non-existent resource', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          return selectResourceById('non-existent-id', transaction)
        })
      ).rejects.toThrow()
    })
  })

  describe('selectResources', () => {
    it('should select resources by organizationId', async () => {
      await adminTransaction(async ({ transaction }) => {
        await insertResource(
          createResourceInsert({ slug: 'seats', name: 'Seats' }),
          transaction
        )
        await insertResource(
          createResourceInsert({
            slug: 'api-keys',
            name: 'API Keys',
          }),
          transaction
        )

        const resources = await selectResources(
          { organizationId: organization.id },
          transaction
        )

        expect(resources.length).toBe(2)
        expect(resources.map((r) => r.slug).sort()).toEqual([
          'api-keys',
          'seats',
        ])
      })
    })

    it('should select resources by pricingModelId', async () => {
      await adminTransaction(async ({ transaction }) => {
        await insertResource(
          createResourceInsert({
            slug: 'seats',
            pricingModelId: pricingModel.id,
          }),
          transaction
        )
        await insertResource(
          createResourceInsert({
            slug: 'api-keys',
            pricingModelId: secondPricingModel.id,
          }),
          transaction
        )

        const resources = await selectResources(
          { pricingModelId: pricingModel.id },
          transaction
        )

        expect(resources.length).toBe(1)
        expect(resources[0].slug).toBe('seats')
      })
    })
  })

  describe('updateResource', () => {
    it('should update a resource name', async () => {
      const inserted = await adminTransaction(
        async ({ transaction }) => {
          return insertResource(createResourceInsert(), transaction)
        }
      )

      await adminTransaction(async ({ transaction }) => {
        const updated = await updateResource(
          { id: inserted.id, name: 'Team Seats' },
          transaction
        )

        expect(updated.id).toBe(inserted.id)
        expect(updated.name).toBe('Team Seats')
        expect(updated.slug).toBe('seats')
      })
    })

    it('should deactivate a resource', async () => {
      const inserted = await adminTransaction(
        async ({ transaction }) => {
          return insertResource(createResourceInsert(), transaction)
        }
      )

      await adminTransaction(async ({ transaction }) => {
        const updated = await updateResource(
          { id: inserted.id, active: false },
          transaction
        )

        expect(updated.active).toBe(false)
      })
    })
  })

  describe('unique constraint on slug within pricing model', () => {
    it('should not allow two resources with the same slug in the same pricing model', async () => {
      await adminTransaction(async ({ transaction }) => {
        await insertResource(
          createResourceInsert({ slug: 'seats' }),
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertResource(
            createResourceInsert({
              slug: 'seats',
              name: 'Another Seats Resource',
            }),
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should allow the same slug in different pricing models', async () => {
      await adminTransaction(async ({ transaction }) => {
        const resource1 = await insertResource(
          createResourceInsert({
            slug: 'seats',
            pricingModelId: pricingModel.id,
          }),
          transaction
        )
        const resource2 = await insertResource(
          createResourceInsert({
            slug: 'seats',
            pricingModelId: secondPricingModel.id,
          }),
          transaction
        )

        expect(resource1.slug).toBe('seats')
        expect(resource2.slug).toBe('seats')
        expect(resource1.pricingModelId).toBe(pricingModel.id)
        expect(resource2.pricingModelId).toBe(secondPricingModel.id)
        expect(resource1.id).not.toBe(resource2.id)
      })
    })

    it('should allow different slugs in the same pricing model', async () => {
      await adminTransaction(async ({ transaction }) => {
        const resource1 = await insertResource(
          createResourceInsert({ slug: 'seats' }),
          transaction
        )
        const resource2 = await insertResource(
          createResourceInsert({ slug: 'api-keys' }),
          transaction
        )

        expect(resource1.slug).toBe('seats')
        expect(resource2.slug).toBe('api-keys')
      })
    })
  })

  describe('upsertResourceByPricingModelIdAndSlug', () => {
    it('should insert a new resource when none exists', async () => {
      await adminTransaction(async ({ transaction }) => {
        const upsertedArray =
          await upsertResourceByPricingModelIdAndSlug(
            createResourceInsert({ slug: 'new-resource' }),
            transaction
          )

        expect(upsertedArray.length).toBe(1)
        expect(upsertedArray[0].slug).toBe('new-resource')
        expect(upsertedArray[0].id).toMatch(/^resource_/)
      })
    })

    it('should do nothing when resource with same slug and pricingModelId exists (onConflictDoNothing)', async () => {
      const inserted = await adminTransaction(
        async ({ transaction }) => {
          return insertResource(
            createResourceInsert({
              slug: 'seats',
              name: 'Original Seats',
            }),
            transaction
          )
        }
      )

      await adminTransaction(async ({ transaction }) => {
        // The upsert with onConflictDoNothing returns empty array when conflict occurs
        const upsertedArray =
          await upsertResourceByPricingModelIdAndSlug(
            {
              ...createResourceInsert({
                slug: 'seats',
                name: 'Updated Seats',
              }),
            },
            transaction
          )

        // onConflictDoNothing returns empty array on conflict
        expect(upsertedArray.length).toBe(0)

        // Verify original record is unchanged
        const original = await selectResourceById(
          inserted.id,
          transaction
        )
        expect(original.name).toBe('Original Seats')
      })
    })
  })

  describe('selectResourcesPaginated', () => {
    it('should return paginated resources with hasMore and cursor when more results exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Insert 5 resources
        for (let i = 0; i < 5; i++) {
          await insertResource(
            createResourceInsert({
              slug: `paginated-resource-${i}`,
              name: `Paginated Resource ${i}`,
            }),
            transaction
          )
        }

        // Get first page with limit of 2
        const page1 = await selectResourcesPaginated(
          { limit: 2 },
          transaction
        )

        // Should return exactly 2 items
        expect(page1.data.length).toBe(2)
        // Should indicate more results are available
        expect(page1.hasMore).toBe(true)
        // Should have a cursor for the next page
        expect(page1.nextCursor).not.toBeUndefined()
        // Total should be at least 5 (we inserted 5, there may be more in the DB)
        expect(page1.total).toBeGreaterThanOrEqual(5)

        // Get second page using cursor
        const page2 = await selectResourcesPaginated(
          { cursor: page1.nextCursor, limit: 2 },
          transaction
        )

        // Should return 2 items
        expect(page2.data.length).toBe(2)
        // page1 and page2 should have different items
        const page1Ids = page1.data.map((r) => r.id)
        const page2Ids = page2.data.map((r) => r.id)
        expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(
          false
        )
      })
    })
  })
})
