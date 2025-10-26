import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectUsageMeterById,
  insertUsageMeter,
  updateUsageMeter,
  selectUsageMeters,
  selectUsageMetersPaginated,
  selectUsageMetersCursorPaginated,
} from './usageMeterMethods'
import {
  setupOrg,
  setupPricingModel,
  setupUsageMeter,
} from '@/../seedDatabase'

describe('usageMeterMethods', () => {
  let organizationId: string
  let pricingModelId: string
  let pricingModelName: string

  beforeEach(async () => {
    const { organization } = await setupOrg()
    organizationId = organization.id
    const pricingModel = await setupPricingModel({ organizationId })
    pricingModelId = pricingModel.id
    pricingModelName = pricingModel.name
  })

  describe('selectUsageMeterById', () => {
    it('should return a usage meter by ID', async () => {
      const meter = await setupUsageMeter({
        organizationId,
        name: 'Meter A',
        pricingModelId,
      })
      await adminTransaction(async ({ transaction }) => {
        const result = await selectUsageMeterById(
          meter.id,
          transaction
        )
        expect(result.id).toBe(meter.id)
        expect(result.name).toBe('Meter A')
        expect(result.pricingModelId).toBe(pricingModelId)
      })
    })

    it('should throw an error for a non-existent ID', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          return selectUsageMeterById('non-existent-id', transaction)
        })
      ).rejects.toThrow()
    })
  })

  describe('insertUsageMeter', () => {
    it('should insert a new usage meter and return it', async () => {
      await adminTransaction(async ({ transaction }) => {
        const newMeter = await insertUsageMeter(
          {
            organizationId,
            name: 'New Meter',
            livemode: true,
            pricingModelId,
            slug: 'new-meter',
          },
          transaction
        )
        expect(newMeter.id).toBeDefined()
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

      await adminTransaction(async ({ transaction }) => {
        const updated = await updateUsageMeter(
          { id: meter.id, name: 'New Name' },
          transaction
        )
        expect(updated.id).toBe(meter.id)
        expect(updated.name).toBe('New Name')
      })
    })

    it('should throw an error when updating a non-existent usage meter', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          return updateUsageMeter(
            { id: 'non-existent-id', name: 'Name' },
            transaction
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
      const otherOrg = await setupOrg()
      await setupUsageMeter({
        organizationId: otherOrg.organization.id,
        name: 'Other',
        pricingModelId: otherOrg.pricingModel.id,
      })
      await adminTransaction(async ({ transaction }) => {
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
      await adminTransaction(async ({ transaction }) => {
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
      await adminTransaction(async ({ transaction }) => {
        const result = await selectUsageMetersPaginated(
          { limit: 2 },
          transaction
        )
        expect(result.data.length).toBe(2)
        expect(result.hasMore).toBe(true)
        expect(result.nextCursor).toBeDefined()
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
      await adminTransaction(async ({ transaction }) => {
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
      await adminTransaction(async ({ transaction }) => {
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
        adminTransaction(async ({ transaction }) => {
          await insertUsageMeter(
            {
              organizationId,
              name: 'Bad',
              livemode: true,
              pricingModelId: 'fake',
              slug: 'bad',
            },
            transaction
          )
          await selectUsageMetersCursorPaginated({
            input: { pageSize: 10 },
            transaction,
          })
        })
      ).rejects.toThrow()
    })
  })
})
