import { describe, it, expect, beforeEach } from 'vitest'
import {
  unexpireProductFeatures,
  syncProductFeatures,
  selectProductFeatures,
} from './productFeatureMethods'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Feature } from '@/db/schema/features'
import {
  setupOrg,
  setupProduct,
  setupToggleFeature,
  setupProductFeature,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'

let organization: Organization.Record
let product: Product.Record
let featureA: Feature.Record
let featureB: Feature.Record
let featureC: Feature.Record
let featureD: Feature.Record

beforeEach(async () => {
  const orgData = await setupOrg()
  organization = orgData.organization
  product = orgData.product

  featureA = await setupToggleFeature({
    organizationId: organization.id,
    name: 'Feature A',
    livemode: true,
  })

  featureB = await setupToggleFeature({
    organizationId: organization.id,
    name: 'Feature B',
    livemode: true,
  })

  featureC = await setupToggleFeature({
    organizationId: organization.id,
    name: 'Feature C',
    livemode: true,
  })

  featureD = await setupToggleFeature({
    organizationId: organization.id,
    name: 'Feature D',
    livemode: true,
  })
})

describe('unexpireProductFeatures', () => {
  it('should un-expire a list of previously expired product features', async () => {
    // - Create two associated product features and set their `expiredAt` to a past date.
    // - Create one other associated product feature that remains active (expiredAt is null).
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: new Date(),
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: new Date(),
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureC.id,
      organizationId: organization.id,
      expiredAt: null, // active
    })

    // - Call `unexpireProductFeatures` with the `productId`, `organizationId`, and an array of the two expired feature IDs.
    const unexpired = await adminTransaction(
      async ({ transaction }) => {
        return unexpireProductFeatures(
          {
            featureIds: [featureA.id, featureB.id],
            productId: product.id,
            organizationId: organization.id,
          },
          transaction
        )
      }
    )

    // - The function should return an array containing two `ProductFeature.Record` objects.
    expect(unexpired).toHaveLength(2)
    // - The `expiredAt` property on both returned records must be null.
    expect(unexpired[0].expiredAt).toBeNull()
    expect(unexpired[1].expiredAt).toBeNull()

    // - A direct database query for the two targeted features should confirm their `expiredAt` value is now null.
    const allFeatures = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures({ productId: product.id }, transaction)
    )
    const featureAModel = allFeatures.find(
      (pf) => pf.featureId === featureA.id
    )
    const featureBModel = allFeatures.find(
      (pf) => pf.featureId === featureB.id
    )
    const featureCModel = allFeatures.find(
      (pf) => pf.featureId === featureC.id
    )

    expect(featureAModel?.expiredAt).toBeNull()
    expect(featureBModel?.expiredAt).toBeNull()
    // - The third, initially active feature should remain untouched and active.
    expect(featureCModel?.expiredAt).toBeNull()
  })

  it('should return an empty array when no features match the un-expire criteria', async () => {
    // - Create a product with several *active* (not expired) product features.
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
    })

    // - Call `unexpireProductFeatures` with `featureIds` corresponding to these active features.
    const result = await adminTransaction(async ({ transaction }) => {
      return unexpireProductFeatures(
        {
          featureIds: [featureA.id, featureB.id],
          productId: product.id,
          organizationId: organization.id,
        },
        transaction
      )
    })
    // - The function should return an empty array.
    expect(result).toHaveLength(0)
  })

  it('should only un-expire features that are in the provided list', async () => {
    // - Create a product with two expired product features (Feature A, Feature B).
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: new Date(),
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: new Date(),
    })
    // - Call `unexpireProductFeatures` with a list containing only the ID for Feature A and a non-existent Feature C.
    const result = await adminTransaction(async ({ transaction }) => {
      return unexpireProductFeatures(
        {
          featureIds: [featureA.id, featureC.id],
          productId: product.id,
          organizationId: organization.id,
        },
        transaction
      )
    })
    // - The function should return an array containing only the record for the un-expired Feature A.
    expect(result).toHaveLength(1)
    expect(result[0].featureId).toBe(featureA.id)
    // - Feature B should remain expired in the database.
    const allFeatures = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures({ productId: product.id }, transaction)
    )
    const featureBModel = allFeatures.find(
      (pf) => pf.featureId === featureB.id
    )
    expect(featureBModel?.expiredAt).not.toBeNull()
  })

  it('should return an empty array when an empty featureIds list is provided', async () => {
    // - Create a product with several expired product features.
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: new Date(),
    })

    // - Call `unexpireProductFeatures` with an empty `featureIds` array.
    const result = await adminTransaction(async ({ transaction }) => {
      return unexpireProductFeatures(
        {
          featureIds: [],
          productId: product.id,
          organizationId: organization.id,
        },
        transaction
      )
    })

    // - The function should return an empty array.
    expect(result).toHaveLength(0)
  })

  it('should not un-expire features if the productId or organizationId does not match', async () => {
    // - Create a product with an expired product feature.
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: new Date(),
    })
    // - Create a second, different product.
    const otherProduct = await setupProduct({
      organizationId: organization.id,
      name: 'Other Product',
      pricingModelId: product.pricingModelId,
    })

    // - Call `unexpireProductFeatures` with the correct featureId but the `productId` of the second product.
    const result = await adminTransaction(async ({ transaction }) => {
      return unexpireProductFeatures(
        {
          featureIds: [featureA.id],
          productId: otherProduct.id,
          organizationId: organization.id,
        },
        transaction
      )
    })

    // - The function should return an empty array.
    expect(result).toHaveLength(0)

    // - The original product feature should remain expired in the database.
    const [originalFeature] = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures(
          { productId: product.id, featureId: featureA.id },
          transaction
        )
    )
    expect(originalFeature?.expiredAt).not.toBeNull()
  })
})

describe('syncProductFeatures', () => {
  it('should create new product features when the product has none', async () => {
    const desiredFeatureIds = [featureA.id, featureB.id]

    // - Call `syncProductFeatures` with the product details and the list of desired feature IDs.
    const result = await adminTransaction(async ({ transaction }) => {
      return syncProductFeatures(
        {
          product,
          desiredFeatureIds,
        },
        transaction
      )
    })

    // - The function should return an array containing two newly created `ProductFeature.Record`s.
    expect(result).toHaveLength(2)
    const resultFeatureIds = new Set(result.map((pf) => pf.featureId))
    expect(resultFeatureIds.has(featureA.id)).toBe(true)
    expect(resultFeatureIds.has(featureB.id)).toBe(true)

    // - A database query should confirm that two new, active product features now link the product to the desired features.
    const allFeatures = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures({ productId: product.id }, transaction)
    )
    expect(allFeatures).toHaveLength(2)
    expect(allFeatures.every((pf) => !pf.expiredAt)).toBe(true)
  })

  it('should expire all existing active product features when an empty array is provided', async () => {
    // - Create a product with two active product features.
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
    })
    // - Call `syncProductFeatures` with an empty `desiredFeatureIds` array.
    const result = await adminTransaction(async ({ transaction }) => {
      return syncProductFeatures(
        {
          product,
          desiredFeatureIds: [],
        },
        transaction
      )
    })

    // - The function should return an empty array.
    expect(result).toHaveLength(0)
    // - All previously active product features for the product should now have a non-null `expiredAt` date in the database.
    const allFeatures = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures({ productId: product.id }, transaction)
    )
    expect(allFeatures).toHaveLength(2)
    expect(allFeatures.every((pf) => pf.expiredAt)).toBe(true)
  })

  it('should restore all existing expired product features when they are in the desired list', async () => {
    // - Create a product with two *expired* product features.
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: new Date(),
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: new Date(),
    })

    // - Call `syncProductFeatures` with `desiredFeatureIds` matching the two expired features.
    const result = await adminTransaction(async ({ transaction }) => {
      return syncProductFeatures(
        {
          product,
          desiredFeatureIds: [featureA.id, featureB.id],
        },
        transaction
      )
    })
    // - The function should return an array of the two now-active `ProductFeature.Record`s.
    expect(result).toHaveLength(2)
    expect(result.every((pf) => !pf.expiredAt)).toBe(true)

    // - Both product features should now have `expiredAt: null` in the database.
    const allFeatures = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures({ productId: product.id }, transaction)
    )
    expect(allFeatures).toHaveLength(2)
    expect(allFeatures.every((pf) => !pf.expiredAt)).toBe(true)
  })

  it('should perform a mix of create, expire, restore, and no-op actions correctly', async () => {
    // - Create a product with the following product features:
    //   - Feature A: Active
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
    })
    //   - Feature B: Active
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
    })
    //   - Feature C: Expired
    await setupProductFeature({
      productId: product.id,
      featureId: featureC.id,
      organizationId: organization.id,
      expiredAt: new Date(),
    })
    // - Feature D is a new feature that doesn't have a product feature record yet.

    // - Call `syncProductFeatures` with `desiredFeatureIds` for Feature A, Feature C, and Feature D.
    const result = await adminTransaction(async ({ transaction }) => {
      return syncProductFeatures(
        {
          product,
          desiredFeatureIds: [featureA.id, featureC.id, featureD.id],
        },
        transaction
      )
    })

    // - The function's return value should contain the records for the created Feature D and the restored Feature C.
    expect(result).toHaveLength(2)
    const resultFeatureIds = new Set(result.map((pf) => pf.featureId))
    expect(resultFeatureIds.has(featureC.id)).toBe(true)
    expect(resultFeatureIds.has(featureD.id)).toBe(true)

    const allFeatures = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures({ productId: product.id }, transaction)
    )

    const featureStates = new Map(
      allFeatures.map((pf) => [pf.featureId, !!pf.expiredAt])
    )

    // - No-op: The product feature for Feature A should remain untouched.
    expect(featureStates.get(featureA.id)).toBe(false) // not expired
    // - Expire: The product feature for Feature B should be expired.
    expect(featureStates.get(featureB.id)).toBe(true) // expired
    // - Restore: The product feature for Feature C should be un-expired (its `expiredAt` set to null).
    expect(featureStates.get(featureC.id)).toBe(false) // not expired
    // - Create: A new product feature should be created for Feature D.
    expect(featureStates.get(featureD.id)).toBe(false) // not expired
  })

  it('should do nothing if the desired state already matches the current state', async () => {
    // - Create a product with:
    //   - Feature A: Active
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
    })
    //   - Feature B: Expired
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: new Date(),
    })

    // - Call `syncProductFeatures` with `desiredFeatureIds` = `['feature_A_id']`.
    const result = await adminTransaction(async ({ transaction }) => {
      return syncProductFeatures(
        {
          product,
          desiredFeatureIds: [featureA.id],
        },
        transaction
      )
    })

    // - The function should return an empty array, as no new or un-expired records are produced.
    expect(result).toHaveLength(0)

    // - A check on the database should show that Feature A is still active and Feature B is still expired.
    const allFeatures = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures({ productId: product.id }, transaction)
    )
    const featureAState = allFeatures.find(
      (pf) => pf.featureId === featureA.id
    )
    const featureBState = allFeatures.find(
      (pf) => pf.featureId === featureB.id
    )
    expect(featureAState?.expiredAt).toBeNull()
    expect(featureBState?.expiredAt).not.toBeNull()
  })
})
