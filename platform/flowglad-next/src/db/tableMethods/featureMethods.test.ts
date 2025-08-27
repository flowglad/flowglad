import { describe, it, beforeEach, expect } from 'vitest'
import { setupOrg, setupPricingModel } from '@/../seedDatabase'
import { insertFeature, selectFeatures } from './featureMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { Feature } from '@/db/schema/features'
import { FeatureType } from '@/types'
import { Organization } from '@/db/schema/organizations'
import { PricingModel } from '@/db/schema/pricingModels'

describe('insertFeature uniqueness constraints', () => {
  let organization1: Organization.Record
  let pricingModel1: PricingModel.Record
  let organization2: Organization.Record
  let pricingModel2: PricingModel.Record

  beforeEach(async () => {
    const orgData1 = await setupOrg()
    organization1 = orgData1.organization
    pricingModel1 = orgData1.pricingModel

    const orgData2 = await setupOrg()
    organization2 = orgData2.organization
    pricingModel2 = orgData2.pricingModel
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
    pricingModelId: catId,
    livemode: true,
    description: 'A test feature',
    type: FeatureType.Toggle,
    active: true,
    amount: null,
    renewalFrequency: null,
    usageMeterId: null,
  })

  it('should not allow two features with the same slug, organizationId, and pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          pricingModel1.id,
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
            pricingModel1.id,
            'unique-slug',
            'Test Feature 2'
          ),
          transaction
        )
      })
    ).rejects.toThrow()
  })

  it('should allow two features with the same slug and organizationId but different pricingModelId', async () => {
    const newPricingModelForOrg1 = await setupPricingModel({
      organizationId: organization1.id,
      name: 'Second PricingModel for Org 1',
    })

    await adminTransaction(async ({ transaction }) => {
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          pricingModel1.id,
          'same-slug',
          'Test Feature 1'
        ),
        transaction
      )
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          newPricingModelForOrg1.id,
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
          pricingModel1.id,
          'same-slug',
          'Feature for Org 1'
        ),
        transaction
      )
      await insertFeature(
        createToggleFeatureInsert(
          organization2.id,
          pricingModel2.id,
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

  it('should allow two features with different slugs for the same organization and pricingModel', async () => {
    await adminTransaction(async ({ transaction }) => {
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          pricingModel1.id,
          'slug-1',
          'Test Feature 1'
        ),
        transaction
      )
      await insertFeature(
        createToggleFeatureInsert(
          organization1.id,
          pricingModel1.id,
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
            pricingModelId: pricingModel1.id,
          },
          transaction
        )
      }
    )
    expect(features.length).toBe(2)
  })
})
