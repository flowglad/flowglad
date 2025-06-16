import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { Catalog } from '@/db/schema/catalogs'
import { Organization } from '@/db/schema/organizations'
import { setupCatalog, setupOrg } from '../../../seedDatabase'
import {
  safelyUpdateCatalog,
  selectCatalogById,
  safelyInsertCatalog,
} from './catalogMethods'

describe('safelyUpdateCatalog', () => {
  let organization: Organization.Record
  let catalogA: Catalog.Record // default
  let catalogB: Catalog.Record // not default

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    catalogA = orgData.catalog

    catalogB = await setupCatalog({
      organizationId: organization.id,
      name: 'Non-Default Catalog',
      isDefault: false,
    })
  })

  it('should make a non-default catalog the new default, and unset the old default', async () => {
    await adminTransaction(async ({ transaction }) => {
      await safelyUpdateCatalog(
        { id: catalogB.id, isDefault: true },
        transaction
      )
    })

    const updatedCatalogA = await adminTransaction(
      async ({ transaction }) =>
        selectCatalogById(catalogA.id, transaction)
    )
    const updatedCatalogB = await adminTransaction(
      async ({ transaction }) =>
        selectCatalogById(catalogB.id, transaction)
    )

    expect(updatedCatalogB.isDefault).toBe(true)
    expect(updatedCatalogA.isDefault).toBe(false)
  })

  it("should update a non-default catalog's properties without affecting the default status of other catalogs", async () => {
    const newName = 'New Catalog Name'
    const updatedCatalogB = await adminTransaction(
      async ({ transaction }) => {
        return await safelyUpdateCatalog(
          { id: catalogB.id, name: newName },
          transaction
        )
      }
    )

    const updatedCatalogA = await adminTransaction(
      async ({ transaction }) =>
        selectCatalogById(catalogA.id, transaction)
    )

    expect(updatedCatalogB.name).toBe(newName)
    expect(updatedCatalogB.isDefault).toBe(false)
    expect(updatedCatalogA.isDefault).toBe(true)
  })

  it('should allow unsetting a default catalog, leaving the organization with no default', async () => {
    const updatedCatalogA = await adminTransaction(
      async ({ transaction }) => {
        return await safelyUpdateCatalog(
          { id: catalogA.id, isDefault: false },
          transaction
        )
      }
    )

    expect(updatedCatalogA.isDefault).toBe(false)
  })

  it('should update a property on a default catalog without changing its default status', async () => {
    const newName = 'New Name For Default Catalog'
    const updatedCatalogA = await adminTransaction(
      async ({ transaction }) => {
        return await safelyUpdateCatalog(
          { id: catalogA.id, name: newName },
          transaction
        )
      }
    )

    expect(updatedCatalogA.name).toBe(newName)
    expect(updatedCatalogA.isDefault).toBe(true)
  })

  it('should not affect the default catalog of another organization', async () => {
    // The beforeEach creates our primary organization and its catalogs.
    // Now, set up a completely separate organization with its own default catalog.
    const otherOrgData = await setupOrg()
    const otherOrgDefaultCatalog = otherOrgData.catalog

    // Action: Make catalogB the new default for the FIRST organization.
    await adminTransaction(async ({ transaction }) => {
      await safelyUpdateCatalog(
        { id: catalogB.id, isDefault: true },
        transaction
      )
    })

    // Expect: The default catalog for the second organization remains unchanged.
    const refreshedOtherOrgCatalog = await adminTransaction(
      async ({ transaction }) =>
        selectCatalogById(otherOrgDefaultCatalog.id, transaction)
    )
    expect(refreshedOtherOrgCatalog.isDefault).toBe(true)

    // Sanity check: The old default for the first organization should now be false.
    const refreshedCatalogA = await adminTransaction(
      async ({ transaction }) =>
        selectCatalogById(catalogA.id, transaction)
    )
    expect(refreshedCatalogA.isDefault).toBe(false)
  })
})

describe('safelyInsertCatalog', () => {
  let organization: Organization.Record
  let existingDefaultCatalog: Catalog.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    existingDefaultCatalog = orgData.catalog // This is the default catalog
  })

  it('should make the new catalog the default and unset the old default', async () => {
    const newCatalog = await adminTransaction(
      async ({ transaction }) => {
        return safelyInsertCatalog(
          {
            name: 'New Default Catalog',
            organizationId: organization.id,
            isDefault: true,
            livemode: true,
          },
          transaction
        )
      }
    )

    const refreshedOldDefault = await adminTransaction(
      async ({ transaction }) =>
        selectCatalogById(existingDefaultCatalog.id, transaction)
    )

    expect(newCatalog.isDefault).toBe(true)
    expect(refreshedOldDefault.isDefault).toBe(false)
  })

  it('should insert a non-default catalog without affecting the existing default', async () => {
    const newCatalog = await adminTransaction(
      async ({ transaction }) => {
        return safelyInsertCatalog(
          {
            name: 'New Non-Default Catalog',
            organizationId: organization.id,
            isDefault: false,
            livemode: true,
          },
          transaction
        )
      }
    )

    const refreshedOldDefault = await adminTransaction(
      async ({ transaction }) =>
        selectCatalogById(existingDefaultCatalog.id, transaction)
    )

    expect(newCatalog.isDefault).toBe(false)
    expect(refreshedOldDefault.isDefault).toBe(true)
  })

  it('should not affect the default catalog of another organization when inserting a new default', async () => {
    // Setup a second organization with its own default catalog
    const otherOrgData = await setupOrg()
    const otherOrgDefaultCatalog = otherOrgData.catalog

    // Insert a new default catalog for the FIRST organization
    await adminTransaction(async ({ transaction }) => {
      return safelyInsertCatalog(
        {
          name: 'New Default Catalog for Org 1',
          organizationId: organization.id,
          isDefault: true,
          livemode: true,
        },
        transaction
      )
    })

    // Check that the second org's default catalog is untouched
    const refreshedOtherOrgCatalog = await adminTransaction(
      async ({ transaction }) =>
        selectCatalogById(otherOrgDefaultCatalog.id, transaction)
    )
    expect(refreshedOtherOrgCatalog.isDefault).toBe(true)
  })
})
