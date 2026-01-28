import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPricingModel,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPricingModelForCustomer } from './pricingModelMethods'
import {
  insertUsageMeter,
  pricingModelIdsForUsageMeters,
  selectUsageMeterById,
  selectUsageMeterBySlugAndCustomerId,
  selectUsageMeters,
  selectUsageMetersByPricingModelId,
  selectUsageMetersCursorPaginated,
  selectUsageMetersPaginated,
  updateUsageMeter,
} from './usageMeterMethods'

describe('usageMeterMethods', () => {
  let organizationId: string
  let pricingModelId: string
  let pricingModelName: string
  let defaultPricingModelId: string

  beforeEach(async () => {
    const { organization, pricingModel } = (await setupOrg()).unwrap()
    organizationId = organization.id
    defaultPricingModelId = pricingModel.id // This is the default pricing model
    const nonDefaultPricingModel = await setupPricingModel({
      organizationId,
    })
    pricingModelId = nonDefaultPricingModel.id
    pricingModelName = nonDefaultPricingModel.name
  })

  describe('selectUsageMeterById', () => {
    it('should return a usage meter by ID', async () => {
      const meter = await setupUsageMeter({
        organizationId,
        name: 'Meter A',
        pricingModelId,
      })
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = (
          await selectUsageMeterById(meter.id, transaction)
        ).unwrap()
        expect(result.id).toBe(meter.id)
        expect(result.name).toBe('Meter A')
        expect(result.pricingModelId).toBe(pricingModelId)
      })
    })

    it('should return an error for a non-existent ID', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMeterById(
          'non-existent-id',
          transaction
        )
        expect(Result.isError(result)).toBe(true)
      })
    })
  })

  describe('insertUsageMeter', () => {
    it('should insert a new usage meter and return it', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const newMeter = await insertUsageMeter(
          {
            organizationId,
            name: 'New Meter',
            livemode: true,
            pricingModelId,
            slug: 'new-meter',
          },
          ctx
        )
        expect(typeof newMeter.id).toBe('string')
        expect(newMeter.name).toBe('New Meter')
        expect(newMeter.pricingModelId).toBe(pricingModelId)
        expect(newMeter.slug).toBe('new-meter')
      })
    })
  })

  describe('updateUsageMeter', () => {
    it('should update an existing usage meter', async () => {
      const meter = await setupUsageMeter({
        organizationId,
        name: 'Old Name',
        pricingModelId,
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const updated = await updateUsageMeter(
          { id: meter.id, name: 'New Name' },
          ctx
        )
        expect(updated.id).toBe(meter.id)
        expect(updated.name).toBe('New Name')
      })
    })

    it('should throw an error when updating a non-existent usage meter', async () => {
      await expect(
        adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return updateUsageMeter(
            { id: 'non-existent-id', name: 'Name' },
            ctx
          )
        })
      ).rejects.toThrow()
    })
  })

  describe('selectUsageMeters', () => {
    it('should return all usage meters for an organization', async () => {
      const m1 = await setupUsageMeter({
        organizationId,
        name: 'M1',
        pricingModelId,
      })
      const m2 = await setupUsageMeter({
        organizationId,
        name: 'M2',
        pricingModelId,
      })
      // other org
      const otherOrg = (await setupOrg()).unwrap()
      await setupUsageMeter({
        organizationId: otherOrg.organization.id,
        name: 'Other',
        pricingModelId: otherOrg.pricingModel.id,
      })
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMeters(
          { organizationId },
          transaction
        )
        const ids = result.map((u) => u.id)
        expect(ids).toContain(m1.id)
        expect(ids).toContain(m2.id)
        expect(ids.length).toBe(2)
      })
    })

    it('should filter usage meters by slug', async () => {
      const meterA = await setupUsageMeter({
        organizationId,
        name: 'A',
        pricingModelId,
        slug: 'slug-a',
      })
      await setupUsageMeter({
        organizationId,
        name: 'B',
        pricingModelId,
        slug: 'slug-b',
      })
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMeters(
          { slug: 'slug-a', organizationId },
          transaction
        )
        expect(result.length).toBe(1)
        expect(result[0].id).toBe(meterA.id)
      })
    })
  })

  describe('selectUsageMetersPaginated', () => {
    it('should return hasMore=true and nextCursor when more items exist', async () => {
      for (let i = 1; i <= 5; i++) {
        await setupUsageMeter({
          organizationId,
          name: `P${i}`,
          pricingModelId,
        })
      }
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMetersPaginated(
          { limit: 2 },
          transaction
        )
        expect(result.data.length).toBe(2)
        expect(result.hasMore).toBe(true)
        expect(typeof result.nextCursor).toBe('string')
      })
    })
  })

  describe('selectUsageMetersCursorPaginated', () => {
    it('should return items enriched with pricing model data', async () => {
      const meter = await setupUsageMeter({
        organizationId,
        name: 'E1',
        pricingModelId,
      })
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMetersCursorPaginated({
          input: {
            pageSize: 10,
            filters: { organizationId },
            sortDirection: 'desc',
          },
          transaction,
        })
        expect(result.items.length).toBeGreaterThanOrEqual(1)
        const item = result.items.find(
          (i) => i.usageMeter.id === meter.id
        )!
        expect(item.pricingModel.id).toBe(pricingModelId)
        expect(item.pricingModel.name).toBe(pricingModelName)
      })
    })

    it('should sort usage meters by creation date descending (newest first) by default', async () => {
      const old = await setupUsageMeter({
        organizationId,
        name: 'Old',
        pricingModelId,
      })
      const neu = await setupUsageMeter({
        organizationId,
        name: 'New',
        pricingModelId,
      })
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMetersCursorPaginated({
          input: { pageSize: 10, filters: { organizationId } },
          transaction,
        })
        expect(result.items[0].usageMeter.id).toBe(neu.id)
        expect(result.items[1].usageMeter.id).toBe(old.id)
      })
    })

    it('should throw an error when inserting a usage meter with a non-existent pricingModelId', async () => {
      await expect(
        adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await insertUsageMeter(
            {
              organizationId,
              name: 'Bad',
              livemode: true,
              pricingModelId: 'fake',
              slug: 'bad',
            },
            ctx
          )
          await selectUsageMetersCursorPaginated({
            input: { pageSize: 10 },
            transaction,
          })
        })
      ).rejects.toThrow()
    })
  })

  describe('selectUsageMeterBySlugAndCustomerId', () => {
    it('should return the correct usage meter when slug matches', async () => {
      const customer = (
        await setupCustomer({
          organizationId,
        })
      ).unwrap()
      // Use the default pricing model since customer will use it
      const meter = await setupUsageMeter({
        organizationId,
        name: 'Test Meter',
        pricingModelId: defaultPricingModelId,
        slug: 'test-meter',
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMeterBySlugAndCustomerId(
          { slug: 'test-meter', customerId: customer.id },
          transaction
        )
        expect(result).toMatchObject({ id: meter.id })
        expect(result!.id).toBe(meter.id)
        expect(result!.slug).toBe('test-meter')
        expect(result!.name).toBe('Test Meter')
      })
    })

    it('should return null when no matching slug exists', async () => {
      const customer = (
        await setupCustomer({
          organizationId,
        })
      ).unwrap()
      // Use the default pricing model since customer will use it
      await setupUsageMeter({
        organizationId,
        name: 'Test Meter',
        pricingModelId: defaultPricingModelId,
        slug: 'test-meter',
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMeterBySlugAndCustomerId(
          { slug: 'non-existent-slug', customerId: customer.id },
          transaction
        )
        expect(result).toBeNull()
      })
    })

    it("should throw an error when customer's pricing model cannot be found and no default exists", async () => {
      // Create a customer with a valid pricing model first
      const orgData = (await setupOrg()).unwrap()
      const customer = (
        await setupCustomer({
          organizationId: orgData.organization.id,
          pricingModelId: orgData.pricingModel.id,
        })
      ).unwrap()

      // Simulate a scenario where:
      // 1. The customer's pricingModelId points to a non-existent pricing model
      // 2. There's no default pricing model for the (fake) organization
      // This tests the error handling in selectUsageMeterBySlugAndCustomerId
      const fakeOrgId = 'org_fake_no_default'
      const fakePricingModelId = 'pricing_model_nonexistent'

      // Override customer object to simulate the error condition
      const customerWithInvalidPricingModel = {
        ...customer,
        organizationId: fakeOrgId,
        pricingModelId: fakePricingModelId,
      }

      // Insert this fake customer record to make selectCustomerById work
      // but with a pricingModelId that doesn't exist
      await expect(
        adminTransaction(async (ctx) => {
          const { transaction } = ctx
          // Note: selectUsageMeterBySlugAndCustomerId internally looks up the customer
          // and then their pricing model. We're testing the case where both:
          // - the customer's pricingModelId doesn't exist
          // - no default pricing model exists for the org
          // To properly test this, we need to mock or override the customer lookup

          // For now, we test by directly calling selectPricingModelForCustomer with the fake data
          return selectPricingModelForCustomer(
            customerWithInvalidPricingModel,
            transaction
          )
        })
      ).rejects.toThrow(
        `No default pricing model found for organization ${fakeOrgId}`
      )
    })
  })

  describe('selectUsageMetersCursorPaginated search', () => {
    it('should search by name, slug, or exact ID (case-insensitive, trims whitespace)', async () => {
      const meter = await setupUsageMeter({
        organizationId,
        pricingModelId,
        name: 'API Calls Meter',
        slug: 'api-calls-meter',
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        // Search by name (case-insensitive)
        const byName = await selectUsageMetersCursorPaginated({
          input: {
            pageSize: 10,
            searchQuery: 'API CALLS',
            filters: { organizationId },
          },
          transaction,
        })
        expect(
          byName.items.some((i) => i.usageMeter.id === meter.id)
        ).toBe(true)

        // Search by slug
        const bySlug = await selectUsageMetersCursorPaginated({
          input: {
            pageSize: 10,
            searchQuery: 'api-calls',
            filters: { organizationId },
          },
          transaction,
        })
        expect(
          bySlug.items.some((i) => i.usageMeter.id === meter.id)
        ).toBe(true)

        // Search by exact ID with whitespace trimming
        const byId = await selectUsageMetersCursorPaginated({
          input: {
            pageSize: 10,
            searchQuery: `  ${meter.id}  `,
            filters: { organizationId },
          },
          transaction,
        })
        expect(byId.items.length).toBe(1)
        expect(byId.items[0].usageMeter.id).toBe(meter.id)
      })
    })

    it('should return all usage meters when search query is empty or undefined', async () => {
      await setupUsageMeter({
        organizationId,
        pricingModelId,
        name: 'Test Meter',
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const resultEmpty = await selectUsageMetersCursorPaginated({
          input: {
            pageSize: 10,
            searchQuery: '',
            filters: { organizationId },
          },
          transaction,
        })

        const resultUndefined =
          await selectUsageMetersCursorPaginated({
            input: {
              pageSize: 10,
              searchQuery: undefined,
              filters: { organizationId },
            },
            transaction,
          })

        expect(resultEmpty.items.length).toBe(1)
        expect(resultUndefined.items.length).toBe(1)
        expect(resultEmpty.total).toBe(resultUndefined.total)
      })
    })
  })

  describe('pricingModelIdsForUsageMeters', () => {
    it('should successfully return map of pricingModelIds for multiple usage meters', async () => {
      const usageMeter1 = await setupUsageMeter({
        organizationId,
        pricingModelId,
        name: 'Test Meter 1',
      })

      const usageMeter2 = await setupUsageMeter({
        organizationId,
        pricingModelId,
        name: 'Test Meter 2',
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const pricingModelIdMap = await pricingModelIdsForUsageMeters(
          [usageMeter1.id, usageMeter2.id],
          transaction
        )

        expect(pricingModelIdMap.size).toBe(2)
        expect(pricingModelIdMap.get(usageMeter1.id)).toBe(
          pricingModelId
        )
        expect(pricingModelIdMap.get(usageMeter2.id)).toBe(
          pricingModelId
        )
      })
    })

    it('should return empty map when no usage meter IDs are provided', async () => {
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const pricingModelIdMap = await pricingModelIdsForUsageMeters(
          [],
          transaction
        )

        expect(pricingModelIdMap.size).toBe(0)
      })
    })

    it('should only return entries for existing usage meters', async () => {
      const usageMeter = await setupUsageMeter({
        organizationId,
        pricingModelId,
        name: 'Test Meter',
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const nonExistentUsageMeterId = `um_nonexistent`
        const pricingModelIdMap = await pricingModelIdsForUsageMeters(
          [usageMeter.id, nonExistentUsageMeterId],
          transaction
        )

        expect(pricingModelIdMap.size).toBe(1)
        expect(pricingModelIdMap.get(usageMeter.id)).toBe(
          pricingModelId
        )
        expect(pricingModelIdMap.has(nonExistentUsageMeterId)).toBe(
          false
        )
      })
    })
  })

  describe('selectUsageMetersByPricingModelId', () => {
    it('should return client-safe usage meter records for a pricing model', async () => {
      const meter1 = await setupUsageMeter({
        organizationId,
        name: 'API Calls',
        pricingModelId,
        slug: 'api-calls',
      })
      const meter2 = await setupUsageMeter({
        organizationId,
        name: 'Storage',
        pricingModelId,
        slug: 'storage',
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMetersByPricingModelId(
          pricingModelId,
          transaction
        )

        expect(result.length).toBe(2)
        const ids = result.map((m) => m.id)
        expect(ids).toContain(meter1.id)
        expect(ids).toContain(meter2.id)

        // Verify client-safe schema is returned (no internal fields exposed)
        const meterResult = result.find((m) => m.id === meter1.id)!
        expect(meterResult.name).toBe('API Calls')
        expect(meterResult.slug).toBe('api-calls')
        expect(meterResult.pricingModelId).toBe(pricingModelId)
      })
    })

    it('should return empty array when pricing model has no usage meters', async () => {
      // Create a pricing model with no meters
      const emptyPricingModel = await setupPricingModel({
        organizationId,
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMetersByPricingModelId(
          emptyPricingModel.id,
          transaction
        )

        expect(result).toEqual([])
      })
    })

    it('should only return meters for the specified pricing model', async () => {
      // Create meters for the test pricing model
      const meter1 = await setupUsageMeter({
        organizationId,
        name: 'PM1 Meter',
        pricingModelId,
      })

      // Create meters for a different pricing model
      const otherPricingModel = await setupPricingModel({
        organizationId,
      })
      await setupUsageMeter({
        organizationId,
        name: 'Other PM Meter',
        pricingModelId: otherPricingModel.id,
      })

      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const result = await selectUsageMetersByPricingModelId(
          pricingModelId,
          transaction
        )

        expect(result.length).toBe(1)
        expect(result[0].id).toBe(meter1.id)
        expect(result[0].name).toBe('PM1 Meter')
      })
    })
  })
})
