import { describe, it, beforeEach, expect } from 'vitest'
import { setupOrg, setupCatalog } from '@/../seedDatabase'
import { insertFeature, selectFeatures } from './featureMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { Feature } from '@/db/schema/features'
import { FeatureType } from '@/types'
import { Organization } from '@/db/schema/organizations'
import { Catalog } from '@/db/schema/catalogs'

describe('insertFeature uniqueness constraints', () => {
  let organization1: Organization.Record
  let catalog1: Catalog.Record
  let organization2: Organization.Record
  let catalog2: Catalog.Record

  beforeEach(async () => {
    const orgData1 = await setupOrg()
    organization1 = orgData1.organization
    catalog1 = orgData1.catalog

    const orgData2 = await setupOrg()
    organization2 = orgData2.organization
    catalog2 = orgData2.catalog
  })

  const createToggleFeatureInsert = (
    orgId: string,
    catId: string,
    slug: string,
    name: string
  ): Feature.ToggleInsert => ({
    organizationId: orgId,
    name,
    slug,
    catalogId: catId,
    livemode: true,
    description: 'A test feature',
    type: FeatureType.Toggle,
    active: true,
    amount: null,
    renewalFrequency: null,
    usageMeterId: null,
  })

  it('should not allow two features with the same slug, organizationId, and catalogId', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          catalog1.id,
          'unique-slug',
          'Test Feature 1'
        ),
        transaction
      )
    })

    await expect(
      adminTransaction(async ({ transaction }) => {
        await insertFeature(
          createToggleFeatureInsert(
            organization1.id,
            catalog1.id,
            'unique-slug',
            'Test Feature 2'
          ),
          transaction
        )
      })
    ).rejects.toThrow()
  })

  it('should allow two features with the same slug and organizationId but different catalogId', async () => {
    const newCatalogForOrg1 = await setupCatalog({
      organizationId: organization1.id,
      name: 'Second Catalog for Org 1',
    })

    await adminTransaction(async ({ transaction }) => {
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          catalog1.id,
          'same-slug',
          'Test Feature 1'
        ),
        transaction
      )
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          newCatalogForOrg1.id,
          'same-slug',
          'Test Feature 2'
        ),
        transaction
      )
    })

    const features = await adminTransaction(
      async ({ transaction }) => {
        return selectFeatures(
          {
            organizationId: organization1.id,
            slug: 'same-slug',
          },
          transaction
        )
      }
    )
    expect(features.length).toBe(2)
  })

  it('should allow two features with the same slug but different organizationId', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          catalog1.id,
          'same-slug',
          'Feature for Org 1'
        ),
        transaction
      )
      await insertFeature(
        createToggleFeatureInsert(
          organization2.id,
          catalog2.id,
          'same-slug',
          'Feature for Org 2'
        ),
        transaction
      )
    })

    const featuresOrg1 = await adminTransaction(
      async ({ transaction }) => {
        return selectFeatures(
          {
            organizationId: organization1.id,
            slug: 'same-slug',
          },
          transaction
        )
      }
    )
    const featuresOrg2 = await adminTransaction(
      async ({ transaction }) => {
        return selectFeatures(
          {
            organizationId: organization2.id,
            slug: 'same-slug',
          },
          transaction
        )
      }
    )
    expect(featuresOrg1.length).toBe(1)
    expect(featuresOrg2.length).toBe(1)
  })

  it('should allow two features with different slugs for the same organization and catalog', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          catalog1.id,
          'slug-1',
          'Test Feature 1'
        ),
        transaction
      )
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          catalog1.id,
          'slug-2',
          'Test Feature 2'
        ),
        transaction
      )
    })

    const features = await adminTransaction(
      async ({ transaction }) => {
        return selectFeatures(
          {
            organizationId: organization1.id,
            catalogId: catalog1.id,
          },
          transaction
        )
      }
    )
    expect(features.length).toBe(2)
  })
})
