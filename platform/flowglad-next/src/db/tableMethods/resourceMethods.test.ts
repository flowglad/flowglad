import { beforeEach, describe, expect, it } from 'vitest'
import { setupOrg, setupPricingModel } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Resource } from '@/db/schema/resources'
import {
  bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug,
  insertResource,
  selectResourceById,
  selectResources,
  selectResourcesTableRowData,
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
    livemode: true,
    active: true,
  })

  describe('insertResource and selectResourceById', () => {
    it('should insert a resource and return it with generated id', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const inserted = await insertResource(
            createResourceInsert(),
            transaction
          )

          expect(inserted.id).toMatch(/^resource_/)
          expect(inserted.slug).toBe('seats')
          expect(inserted.name).toBe('Seats')
          expect(inserted.organizationId).toBe(organization.id)
          expect(inserted.pricingModelId).toBe(pricingModel.id)
          expect(inserted.active).toBe(true)
          expect(inserted.livemode).toBe(true)
        })
      ).unwrap()
    })

    it('should select a resource by id and return the same record', async () => {
      const inserted = (
        await adminTransaction(async ({ transaction }) => {
          return insertResource(createResourceInsert(), transaction)
        })
      ).unwrap()

      ;(
        await adminTransaction(async ({ transaction }) => {
          const selected = await selectResourceById(
            inserted.id,
            transaction
          )

          expect(selected.id).toBe(inserted.id)
          expect(selected.slug).toBe(inserted.slug)
          expect(selected.name).toBe(inserted.name)
          expect(selected.pricingModelId).toBe(
            inserted.pricingModelId
          )
        })
      ).unwrap()
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
      ;(
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
      ).unwrap()
    })

    it('should select resources by pricingModelId', async () => {
      ;(
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
      ).unwrap()
    })
  })

  describe('updateResource', () => {
    it('should update a resource name', async () => {
      const inserted = (
        await adminTransaction(async ({ transaction }) => {
          return insertResource(createResourceInsert(), transaction)
        })
      ).unwrap()

      ;(
        await adminTransaction(async ({ transaction }) => {
          const updated = await updateResource(
            { id: inserted.id, name: 'Team Seats' },
            transaction
          )

          expect(updated.id).toBe(inserted.id)
          expect(updated.name).toBe('Team Seats')
          expect(updated.slug).toBe('seats')
        })
      ).unwrap()
    })

    it('should deactivate a resource', async () => {
      const inserted = (
        await adminTransaction(async ({ transaction }) => {
          return insertResource(createResourceInsert(), transaction)
        })
      ).unwrap()

      ;(
        await adminTransaction(async ({ transaction }) => {
          const updated = await updateResource(
            { id: inserted.id, active: false },
            transaction
          )

          expect(updated.active).toBe(false)
        })
      ).unwrap()
    })
  })

  describe('unique constraint on slug within pricing model', () => {
    it('should not allow two resources with the same slug in the same pricing model', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          await insertResource(
            createResourceInsert({ slug: 'seats' }),
            transaction
          )
        })
      ).unwrap()

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
      ;(
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
      ).unwrap()
    })

    it('should allow different slugs in the same pricing model', async () => {
      ;(
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
      ).unwrap()
    })
  })

  describe('upsertResourceByPricingModelIdAndSlug', () => {
    it('should insert a new resource when none exists', async () => {
      ;(
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
      ).unwrap()
    })

    it('should do nothing when resource with same slug and pricingModelId exists (onConflictDoNothing)', async () => {
      const inserted = (
        await adminTransaction(async ({ transaction }) => {
          return insertResource(
            createResourceInsert({
              slug: 'seats',
              name: 'Original Seats',
            }),
            transaction
          )
        })
      ).unwrap()

      ;(
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
      ).unwrap()
    })
  })

  describe('selectResourcesTableRowData', () => {
    it('should return resources with joined pricing model data', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const resource1 = await insertResource(
            createResourceInsert({
              slug: 'table-row-resource-1',
              name: 'Table Row Resource 1',
            }),
            transaction
          )
          const resource2 = await insertResource(
            createResourceInsert({
              slug: 'table-row-resource-2',
              name: 'Table Row Resource 2',
              pricingModelId: secondPricingModel.id,
            }),
            transaction
          )

          const result = await selectResourcesTableRowData({
            input: {
              pageSize: 10,
              filters: { organizationId: organization.id },
            },
            transaction,
          })

          // Should include our resources with pricing model info
          const foundResource1 = result.items.find(
            (item) => item.resource.id === resource1.id
          )
          const foundResource2 = result.items.find(
            (item) => item.resource.id === resource2.id
          )

          expect(foundResource1!.resource.slug).toBe(
            'table-row-resource-1'
          )
          expect(foundResource1!.pricingModel.id).toBe(
            pricingModel.id
          )
          expect(foundResource1!.pricingModel.name).toBe(
            pricingModel.name
          )

          expect(foundResource2!.resource.slug).toBe(
            'table-row-resource-2'
          )
          expect(foundResource2!.pricingModel.id).toBe(
            secondPricingModel.id
          )
          expect(foundResource2!.pricingModel.name).toBe(
            'Second Pricing Model'
          )
        })
      ).unwrap()
    })

    it('should support search by resource name via ILIKE', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          await insertResource(
            createResourceInsert({
              slug: 'searchable-seats',
              name: 'Searchable Seats Resource',
            }),
            transaction
          )
          await insertResource(
            createResourceInsert({
              slug: 'api-keys',
              name: 'API Keys',
            }),
            transaction
          )

          const result = await selectResourcesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'Searchable',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

          // Should only return the resource matching the search
          expect(result.items.length).toBeGreaterThanOrEqual(1)
          const matchingItem = result.items.find(
            (item) =>
              item.resource.name === 'Searchable Seats Resource'
          )
          expect(matchingItem!.resource.slug).toBe('searchable-seats')
        })
      ).unwrap()
    })

    it('should support search by exact resource ID match', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const targetResource = await insertResource(
            createResourceInsert({
              slug: 'id-searchable',
              name: 'ID Searchable Resource',
            }),
            transaction
          )
          await insertResource(
            createResourceInsert({
              slug: 'other-resource',
              name: 'Other Resource',
            }),
            transaction
          )

          // Search by exact ID
          const result = await selectResourcesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: targetResource.id,
              filters: { organizationId: organization.id },
            },
            transaction,
          })

          // Should find the resource by ID
          expect(result.items.length).toBe(1)
          expect(result.items[0].resource.id).toBe(targetResource.id)
          expect(result.items[0].resource.slug).toBe('id-searchable')
        })
      ).unwrap()
    })

    it('should trim whitespace from search queries when searching by exact ID', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const resource = await insertResource(
            createResourceInsert({
              slug: 'trim-test',
              name: 'TrimTestResource',
            }),
            transaction
          )

          // Search by ID with surrounding whitespace - the implementation trims for ID matching
          const result = await selectResourcesTableRowData({
            input: {
              pageSize: 10,
              searchQuery: `   ${resource.id}   `,
              filters: { organizationId: organization.id },
            },
            transaction,
          })

          // Should find the resource by ID despite whitespace in query
          expect(result.items.length).toBe(1)
          expect(result.items[0].resource.id).toBe(resource.id)
          expect(result.items[0].resource.slug).toBe('trim-test')
          expect(result.items[0].resource.name).toBe(
            'TrimTestResource'
          )
        })
      ).unwrap()
    })
  })

  describe('bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug', () => {
    it('should insert multiple resources when no conflicts exist', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const inserts: Resource.Insert[] = [
            createResourceInsert({
              slug: 'bulk-resource-1',
              name: 'Bulk Resource 1',
            }),
            createResourceInsert({
              slug: 'bulk-resource-2',
              name: 'Bulk Resource 2',
            }),
            createResourceInsert({
              slug: 'bulk-resource-3',
              name: 'Bulk Resource 3',
            }),
          ]

          const inserted =
            await bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug(
              inserts,
              transaction
            )

          expect(inserted.length).toBe(3)
          expect(inserted.map((r) => r.slug).sort()).toEqual([
            'bulk-resource-1',
            'bulk-resource-2',
            'bulk-resource-3',
          ])
          for (const resource of inserted) {
            expect(resource.id).toMatch(/^resource_/)
            expect(resource.pricingModelId).toBe(pricingModel.id)
            expect(resource.organizationId).toBe(organization.id)
          }
        })
      ).unwrap()
    })

    it('should skip inserting resources that conflict on pricingModelId + slug + organizationId', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Insert an existing resource
          const existing = await insertResource(
            createResourceInsert({
              slug: 'existing-resource',
              name: 'Existing Resource',
            }),
            transaction
          )

          // Try bulk insert with one conflicting and one new resource
          const inserts: Resource.Insert[] = [
            createResourceInsert({
              slug: 'existing-resource', // conflicts with existing
              name: 'Different Name',
            }),
            createResourceInsert({
              slug: 'new-bulk-resource',
              name: 'New Bulk Resource',
            }),
          ]

          const inserted =
            await bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug(
              inserts,
              transaction
            )

          // Only the non-conflicting resource should be inserted
          expect(inserted.length).toBe(1)
          expect(inserted[0].slug).toBe('new-bulk-resource')

          // Verify the existing resource was not modified
          const existingAfter = await selectResourceById(
            existing.id,
            transaction
          )
          expect(existingAfter.name).toBe('Existing Resource')
        })
      ).unwrap()
    })

    it('should allow same slug across different pricing models', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Insert resource in first pricing model
          await insertResource(
            createResourceInsert({
              slug: 'shared-slug',
              name: 'Shared Slug PM1',
              pricingModelId: pricingModel.id,
            }),
            transaction
          )

          // Bulk insert the same slug for a different pricing model
          const inserts: Resource.Insert[] = [
            createResourceInsert({
              slug: 'shared-slug',
              name: 'Shared Slug PM2',
              pricingModelId: secondPricingModel.id,
            }),
          ]

          const inserted =
            await bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug(
              inserts,
              transaction
            )

          // Should successfully insert because it's a different pricing model
          expect(inserted.length).toBe(1)
          expect(inserted[0].slug).toBe('shared-slug')
          expect(inserted[0].pricingModelId).toBe(
            secondPricingModel.id
          )
        })
      ).unwrap()
    })

    it('should return empty array when all inserts conflict', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Pre-insert resources
          await insertResource(
            createResourceInsert({
              slug: 'conflict-1',
              name: 'Conflict 1',
            }),
            transaction
          )
          await insertResource(
            createResourceInsert({
              slug: 'conflict-2',
              name: 'Conflict 2',
            }),
            transaction
          )

          // Try bulk insert with all conflicting resources
          const inserts: Resource.Insert[] = [
            createResourceInsert({
              slug: 'conflict-1',
              name: 'New Conflict 1',
            }),
            createResourceInsert({
              slug: 'conflict-2',
              name: 'New Conflict 2',
            }),
          ]

          const inserted =
            await bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug(
              inserts,
              transaction
            )

          expect(inserted.length).toBe(0)
        })
      ).unwrap()
    })
  })
})
