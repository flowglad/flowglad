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
  setupCatalog,
  setupMemberships,
  setupUsageMeter,
} from '@/../seedDatabase'

describe('usageMeterMethods', () => {
  let organizationId: string
  let catalogId: string
  let catalogName: string

  beforeEach(async () => {
    const { organization } = await setupOrg()
    organizationId = organization.id
    const catalog = await setupCatalog({ organizationId })
    catalogId = catalog.id
    catalogName = catalog.name
  })

  describe('selectUsageMeterById', () => {
    it('should return a usage meter by ID', async () => {
      const meter = await setupUsageMeter({
        organizationId,
        name: 'Meter A',
        catalogId,
      })
      await adminTransaction(async ({ transaction }) => {
        const result = await selectUsageMeterById(
          meter.id,
          transaction
        )
        expect(result.id).toBe(meter.id)
        expect(result.name).toBe('Meter A')
        expect(result.catalogId).toBe(catalogId)
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
            catalogId,
            slug: 'new-meter',
          },
          transaction
        )
        expect(newMeter.id).toBeDefined()
        expect(newMeter.name).toBe('New Meter')
        expect(newMeter.catalogId).toBe(catalogId)
        expect(newMeter.slug).toBe('new-meter')
      })
    })
  })

  describe('updateUsageMeter', () => {
    it('should update an existing usage meter', async () => {
      const meter = await setupUsageMeter({
        organizationId,
        name: 'Old Name',
        catalogId,
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
        catalogId,
      })
      const m2 = await setupUsageMeter({
        organizationId,
        name: 'M2',
        catalogId,
      })
      // other org
      const otherOrg = await setupOrg()
      await setupUsageMeter({
        organizationId: otherOrg.organization.id,
        name: 'Other',
        catalogId: otherOrg.catalog.id,
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
        catalogId,
        slug: 'slug-a',
      })
      await setupUsageMeter({
        organizationId,
        name: 'B',
        catalogId,
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
          catalogId,
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
    it('should return items enriched with catalog data', async () => {
      const meter = await setupUsageMeter({
        organizationId,
        name: 'E1',
        catalogId,
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
        expect(item.catalog.id).toBe(catalogId)
        expect(item.catalog.name).toBe(catalogName)
      })
    })

    it('should sort usage meters by creation date descending (newest first) by default', async () => {
      const old = await setupUsageMeter({
        organizationId,
        name: 'Old', 
        catalogId,
      })
      const neu = await setupUsageMeter({
        organizationId,
        name: 'New',
        catalogId,
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

    it('should throw an error when inserting a usage meter with a non-existent catalogId', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          await insertUsageMeter(
            {
              organizationId,
              name: 'Bad',
              livemode: true,
              catalogId: 'fake',
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
