import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupProduct,
  setupProductFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupToggleFeature,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { Feature } from '@/db/schema/features'
import type { Organization } from '@/db/schema/organizations'
import type { Product } from '@/db/schema/products'
import { createCapturingEffectsContext } from '@/test-utils/transactionCallbacks'
import {
  IntervalUnit,
  PriceType,
  SubscriptionItemType,
} from '@/types'
import { CacheDependency } from '@/utils/cache'
import { core } from '@/utils/core'
import {
  batchUnexpireProductFeatures,
  bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId,
  bulkInsertProductFeatures,
  insertProductFeature,
  selectFeaturesByProductFeatureWhere,
  selectProductFeatures,
  syncProductFeatures,
  unexpireProductFeatures,
} from './productFeatureMethods'

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
      expiredAt: Date.now(),
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: Date.now(),
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
      expiredAt: Date.now(),
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: Date.now(),
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
    expect(typeof featureBModel?.expiredAt).toBe('number')
  })

  it('should return an empty array when an empty featureIds list is provided', async () => {
    // - Create a product with several expired product features.
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: Date.now(),
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
      expiredAt: Date.now(),
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
    expect(typeof originalFeature?.expiredAt).toBe('number')
  })
})

describe('batchUnexpireProductFeatures', () => {
  it('unexpires multiple product features by their IDs across different products', async () => {
    // Create a second product for testing cross-product batch operations
    const product2 = await setupProduct({
      organizationId: organization.id,
      name: 'Product 2',
      pricingModelId: product.pricingModelId,
    })

    // Create expired product features on different products
    const pf1 = await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000,
    })
    const pf2 = await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000,
    })
    const pf3 = await setupProductFeature({
      productId: product2.id,
      featureId: featureC.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000,
    })

    // Batch unexpire all three
    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const unexpireResult = await batchUnexpireProductFeatures(
          [pf1.id, pf2.id, pf3.id],
          { transaction, invalidateCache }
        )
        return Result.ok(unexpireResult)
      }
    )

    // Should return all three unexpired records
    expect(result).toHaveLength(3)
    expect(result.every((pf) => pf.expiredAt === null)).toBe(true)

    // Verify database state
    const allFeatures = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures(
          { productId: [product.id, product2.id] },
          transaction
        )
    )
    expect(allFeatures.every((pf) => pf.expiredAt === null)).toBe(
      true
    )
  })

  it('returns empty array when given empty productFeatureIds list', async () => {
    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const unexpireResult = await batchUnexpireProductFeatures(
          [],
          { transaction, invalidateCache }
        )
        return Result.ok(unexpireResult)
      }
    )

    expect(result).toEqual([])
  })

  it('only unexpires features that are currently expired', async () => {
    // Create one expired and one active product feature
    const expiredPf = await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000,
    })
    const activePf = await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: null, // active
    })

    // Try to unexpire both
    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const unexpireResult = await batchUnexpireProductFeatures(
          [expiredPf.id, activePf.id],
          { transaction, invalidateCache }
        )
        return Result.ok(unexpireResult)
      }
    )

    // Should only return the one that was actually expired
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(expiredPf.id)
    expect(result[0].expiredAt).toBeNull()
  })

  it('returns empty array when all provided IDs are already active', async () => {
    // Create active product features
    const pf1 = await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: null,
    })
    const pf2 = await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: null,
    })

    // Try to unexpire active features
    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const unexpireResult = await batchUnexpireProductFeatures(
          [pf1.id, pf2.id],
          { transaction, invalidateCache }
        )
        return Result.ok(unexpireResult)
      }
    )

    // Should return empty array since nothing was actually unexpired
    expect(result).toHaveLength(0)
  })

  it('ignores non-existent productFeature IDs without error', async () => {
    // Create one real expired product feature
    const realPf = await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000,
    })

    // Include a non-existent ID
    const fakeId = `product_feature_${core.nanoid()}`

    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const unexpireResult = await batchUnexpireProductFeatures(
          [realPf.id, fakeId],
          { transaction, invalidateCache }
        )
        return Result.ok(unexpireResult)
      }
    )

    // Should only return the real one that was unexpired
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(realPf.id)
    expect(result[0].expiredAt).toBeNull()
  })

  it('returns only the previously-expired product features when given mixed expired and active IDs', async () => {
    // Create mixed state product features
    const expired1 = await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000,
    })
    const active1 = await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: null,
    })
    const expired2 = await setupProductFeature({
      productId: product.id,
      featureId: featureC.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 2000,
    })

    // Unexpire all three
    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const unexpireResult = await batchUnexpireProductFeatures(
          [expired1.id, active1.id, expired2.id],
          { transaction, invalidateCache }
        )
        return Result.ok(unexpireResult)
      }
    )

    // Should only return the two that were expired
    expect(result).toHaveLength(2)
    const resultIds = new Set(result.map((pf) => pf.id))
    expect(resultIds.has(expired1.id)).toBe(true)
    expect(resultIds.has(expired2.id)).toBe(true)
    expect(resultIds.has(active1.id)).toBe(false)

    // All returned records should have expiredAt = null
    expect(result.every((pf) => pf.expiredAt === null)).toBe(true)
  })

  it('invalidates subscription item feature caches for affected subscription items when unexpiring product features', async () => {
    // Set up a customer and subscription with a subscription item using the product's price
    const customer = await setupCustomer({
      organizationId: organization.id,
      email: `test+${core.nanoid()}@test.com`,
    })

    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      livemode: true,
      isDefault: false,
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    const subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Test Item',
      quantity: 1,
      unitPrice: 1000,
      priceId: price.id,
      addedDate: Date.now(),
      type: SubscriptionItemType.Static,
    })

    // Create an expired product feature
    const expiredPf = await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000,
    })

    // Unexpire the product feature and capture effects
    await adminTransaction(async ({ transaction }) => {
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
      await batchUnexpireProductFeatures([expiredPf.id], ctx)

      // Verify cache invalidation was emitted for the subscription item
      expect(effects.cacheInvalidations).toContainEqual(
        CacheDependency.subscriptionItemFeatures(subscriptionItem.id)
      )
    })
  })

  it('invalidates caches for multiple subscription items across different products when unexpiring product features', async () => {
    // Set up a second product
    const product2 = await setupProduct({
      organizationId: organization.id,
      name: 'Product 2',
      pricingModelId: product.pricingModelId,
    })

    const customer = await setupCustomer({
      organizationId: organization.id,
      email: `test+${core.nanoid()}@test.com`,
    })

    // Create prices for both products
    const price1 = await setupPrice({
      productId: product.id,
      name: 'Price 1',
      livemode: true,
      isDefault: false,
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    const price2 = await setupPrice({
      productId: product2.id,
      name: 'Price 2',
      livemode: true,
      isDefault: false,
      type: PriceType.Subscription,
      unitPrice: 2000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    // Create subscriptions and subscription items for both products
    const subscription1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price1.id,
      livemode: true,
    })

    const subscription2 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price2.id,
      livemode: true,
    })

    const subscriptionItem1 = await setupSubscriptionItem({
      subscriptionId: subscription1.id,
      name: 'Item 1',
      quantity: 1,
      unitPrice: 1000,
      priceId: price1.id,
      addedDate: Date.now(),
      type: SubscriptionItemType.Static,
    })

    const subscriptionItem2 = await setupSubscriptionItem({
      subscriptionId: subscription2.id,
      name: 'Item 2',
      quantity: 1,
      unitPrice: 2000,
      priceId: price2.id,
      addedDate: Date.now(),
      type: SubscriptionItemType.Static,
    })

    // Create expired product features on both products
    const expiredPf1 = await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000,
    })

    const expiredPf2 = await setupProductFeature({
      productId: product2.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000,
    })

    // Unexpire both product features and capture effects
    await adminTransaction(async ({ transaction }) => {
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
      await batchUnexpireProductFeatures(
        [expiredPf1.id, expiredPf2.id],
        ctx
      )

      // Verify cache invalidations were emitted for both subscription items
      expect(effects.cacheInvalidations).toContainEqual(
        CacheDependency.subscriptionItemFeatures(subscriptionItem1.id)
      )
      expect(effects.cacheInvalidations).toContainEqual(
        CacheDependency.subscriptionItemFeatures(subscriptionItem2.id)
      )
    })
  })

  it('does not emit cache invalidations when no product features are actually unexpired', async () => {
    // Create an active (not expired) product feature
    const activePf = await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: null,
    })

    // Try to unexpire the already-active feature
    await adminTransaction(async ({ transaction }) => {
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
      const result = await batchUnexpireProductFeatures(
        [activePf.id],
        ctx
      )

      // No features were actually unexpired
      expect(result).toHaveLength(0)
      // No cache invalidations should be emitted
      expect(effects.cacheInvalidations).toHaveLength(0)
    })
  })

  it('does not emit cache invalidations when there are no subscription items for the affected products', async () => {
    // Create an expired product feature but no subscription items
    const expiredPf = await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000,
    })

    // Unexpire the product feature
    await adminTransaction(async ({ transaction }) => {
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
      const result = await batchUnexpireProductFeatures(
        [expiredPf.id],
        ctx
      )

      // Feature was unexpired
      expect(result).toHaveLength(1)
      // But no cache invalidations since no subscription items exist
      expect(effects.cacheInvalidations).toHaveLength(0)
    })
  })
})

describe('syncProductFeatures', () => {
  it('should create new product features when the product has none', async () => {
    const desiredFeatureIds = [featureA.id, featureB.id]

    // - Call `syncProductFeatures` with the product details and the list of desired feature IDs.
    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const syncResult = await syncProductFeatures(
          {
            product,
            desiredFeatureIds,
          },
          { transaction, invalidateCache }
        )
        return Result.ok(syncResult)
      }
    )

    // - The function should return an array containing two newly created `ProductFeature.Record`s.
    expect(result).toHaveLength(2)
    const resultFeatureIds = new Set(result.map((pf) => pf.featureId))
    expect(resultFeatureIds.has(featureA.id)).toBe(true)
    expect(resultFeatureIds.has(featureB.id)).toBe(true)
    // Verify pricingModelId is correctly derived from product
    expect(
      result.every(
        (pf) => pf.pricingModelId === product.pricingModelId
      )
    ).toBe(true)

    // - A database query should confirm that two new, active product features now link the product to the desired features.
    const allFeatures = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures({ productId: product.id }, transaction)
    )
    expect(allFeatures).toHaveLength(2)
    expect(allFeatures.every((pf) => !pf.expiredAt)).toBe(true)
    // Verify pricingModelId matches product for all features
    expect(
      allFeatures.every(
        (pf) => pf.pricingModelId === product.pricingModelId
      )
    ).toBe(true)
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
    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const syncResult = await syncProductFeatures(
          {
            product,
            desiredFeatureIds: [],
          },
          { transaction, invalidateCache }
        )
        return Result.ok(syncResult)
      }
    )

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
      expiredAt: Date.now(),
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: Date.now(),
    })

    // - Call `syncProductFeatures` with `desiredFeatureIds` matching the two expired features.
    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const syncResult = await syncProductFeatures(
          {
            product,
            desiredFeatureIds: [featureA.id, featureB.id],
          },
          { transaction, invalidateCache }
        )
        return Result.ok(syncResult)
      }
    )
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
      expiredAt: Date.now(),
    })
    // - Feature D is a new feature that doesn't have a product feature record yet.

    // - Call `syncProductFeatures` with `desiredFeatureIds` for Feature A, Feature C, and Feature D.
    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const syncResult = await syncProductFeatures(
          {
            product,
            desiredFeatureIds: [
              featureA.id,
              featureC.id,
              featureD.id,
            ],
          },
          { transaction, invalidateCache }
        )
        return Result.ok(syncResult)
      }
    )

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
      expiredAt: Date.now(),
    })

    // - Call `syncProductFeatures` with `desiredFeatureIds` = `['feature_A_id']`.
    const result = await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache }) => {
        const syncResult = await syncProductFeatures(
          {
            product,
            desiredFeatureIds: [featureA.id],
          },
          { transaction, invalidateCache }
        )
        return Result.ok(syncResult)
      }
    )

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
    expect(typeof featureBState?.expiredAt).toBe('number')
  })
})

describe('selectFeaturesByProductFeatureWhere', () => {
  it('should only return active features (expiredAt is null)', async () => {
    // Create active features
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: null, // active
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: null, // active
    })

    // Create expired features
    await setupProductFeature({
      productId: product.id,
      featureId: featureC.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000, // expired in the past
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectFeaturesByProductFeatureWhere(
        { productId: product.id },
        transaction
      )
    })

    // Should only return active features (A and B)
    expect(result).toHaveLength(2)
    const returnedFeatureIds = result.map((r) => r.feature.id)
    expect(returnedFeatureIds).toContain(featureA.id)
    expect(returnedFeatureIds).toContain(featureB.id)
    expect(returnedFeatureIds).not.toContain(featureC.id)
  })

  it('should return features that expire in the future', async () => {
    const futureTime = Date.now() + 24 * 60 * 60 * 1000 // 24 hours from now

    // Create a feature that expires in the future
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: futureTime,
    })

    // Create a feature that never expires
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: null,
    })

    // Create a feature that already expired
    await setupProductFeature({
      productId: product.id,
      featureId: featureC.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000, // expired in the past
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectFeaturesByProductFeatureWhere(
        { productId: product.id },
        transaction
      )
    })

    // Should return both the future-expiring feature and the never-expiring feature
    expect(result).toHaveLength(2)
    const returnedFeatureIds = result.map((r) => r.feature.id)
    expect(returnedFeatureIds).toContain(featureA.id) // future expiration
    expect(returnedFeatureIds).toContain(featureB.id) // never expires
    expect(returnedFeatureIds).not.toContain(featureC.id) // already expired
  })

  it('should not return features that have already expired', async () => {
    const pastTime = Date.now() - 1000 // 1 second ago

    // Create features with past expiration
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: pastTime,
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: pastTime,
    })

    // Create one active feature for comparison
    await setupProductFeature({
      productId: product.id,
      featureId: featureC.id,
      organizationId: organization.id,
      expiredAt: null,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectFeaturesByProductFeatureWhere(
        { productId: product.id },
        transaction
      )
    })

    // Should only return the active feature
    expect(result).toHaveLength(1)
    expect(result[0].feature.id).toBe(featureC.id)
  })

  it('should return empty array when all features are expired', async () => {
    const pastTime = Date.now() - 1000

    // Create only expired features
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: pastTime,
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: pastTime,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectFeaturesByProductFeatureWhere(
        { productId: product.id },
        transaction
      )
    })

    // Should return empty array
    expect(result).toHaveLength(0)
  })

  it('should handle mixed expiration states correctly', async () => {
    const pastTime = Date.now() - 1000
    const futureTime = Date.now() + 24 * 60 * 60 * 1000 // 24 hours from now

    // Feature A: Never expires (null)
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: null,
    })

    // Feature B: Expires in the future
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: futureTime,
    })

    // Feature C: Already expired
    await setupProductFeature({
      productId: product.id,
      featureId: featureC.id,
      organizationId: organization.id,
      expiredAt: pastTime,
    })

    // Feature D: Expires in the future (different time)
    await setupProductFeature({
      productId: product.id,
      featureId: featureD.id,
      organizationId: organization.id,
      expiredAt: futureTime + 1000,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectFeaturesByProductFeatureWhere(
        { productId: product.id },
        transaction
      )
    })

    // Should return A, B, and D (not C)
    expect(result).toHaveLength(3)
    const returnedFeatureIds = result.map((r) => r.feature.id)
    expect(returnedFeatureIds).toContain(featureA.id) // never expires
    expect(returnedFeatureIds).toContain(featureB.id) // future expiration
    expect(returnedFeatureIds).toContain(featureD.id) // future expiration
    expect(returnedFeatureIds).not.toContain(featureC.id) // already expired
  })

  it('should work with specific feature filtering', async () => {
    // Create active and expired features
    await setupProductFeature({
      productId: product.id,
      featureId: featureA.id,
      organizationId: organization.id,
      expiredAt: null, // active
    })
    await setupProductFeature({
      productId: product.id,
      featureId: featureB.id,
      organizationId: organization.id,
      expiredAt: Date.now() - 1000, // expired
    })

    // Query for specific feature
    const result = await adminTransaction(async ({ transaction }) => {
      return selectFeaturesByProductFeatureWhere(
        { productId: product.id, featureId: featureA.id },
        transaction
      )
    })

    // Should return only the active feature A
    expect(result).toHaveLength(1)
    expect(result[0].feature.id).toBe(featureA.id)
  })
})

describe('insertProductFeature', () => {
  it('should successfully insert product feature and derive pricingModelId from product', async () => {
    await adminTransaction(async ({ transaction }) => {
      const productFeature = await insertProductFeature(
        {
          productId: product.id,
          featureId: featureA.id,
          organizationId: organization.id,
          livemode: true,
        },
        transaction
      )

      // Verify pricingModelId is correctly derived from product
      expect(productFeature.pricingModelId).toBe(
        product.pricingModelId
      )
    })
  })

  it('should use provided pricingModelId without derivation', async () => {
    const customPricingModelId = product.pricingModelId

    await adminTransaction(async ({ transaction }) => {
      const productFeature = await insertProductFeature(
        {
          productId: product.id,
          featureId: featureA.id,
          organizationId: organization.id,
          livemode: true,
          pricingModelId: customPricingModelId, // Pre-provided
        },
        transaction
      )

      // Verify the provided pricingModelId is used
      expect(productFeature.pricingModelId).toBe(customPricingModelId)
    })
  })

  it('should throw an error when productId does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentProductId = `prod_${core.nanoid()}`

      await expect(
        insertProductFeature(
          {
            productId: nonExistentProductId,
            featureId: featureA.id,
            organizationId: organization.id,
            livemode: true,
          },
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('bulkInsertProductFeatures', () => {
  let product2: Product.Record

  beforeEach(async () => {
    product2 = await setupProduct({
      organizationId: organization.id,
      name: 'Test Product 2',
      pricingModelId: product.pricingModelId,
      livemode: true,
    })
  })

  it('should bulk insert product features and derive pricingModelId for each', async () => {
    await adminTransaction(async ({ transaction }) => {
      const productFeatures = await bulkInsertProductFeatures(
        [
          {
            productId: product.id,
            featureId: featureA.id,
            organizationId: organization.id,
            livemode: true,
          },
          {
            productId: product2.id,
            featureId: featureB.id,
            organizationId: organization.id,
            livemode: true,
          },
        ],
        transaction
      )

      expect(productFeatures).toHaveLength(2)
      expect(productFeatures[0]!.pricingModelId).toBe(
        product.pricingModelId
      )
      expect(productFeatures[1]!.pricingModelId).toBe(
        product2.pricingModelId
      )
    })
  })

  it('should honor pre-provided pricingModelId in bulk insert', async () => {
    await adminTransaction(async ({ transaction }) => {
      const productFeatures = await bulkInsertProductFeatures(
        [
          {
            productId: product.id,
            featureId: featureA.id,
            organizationId: organization.id,
            livemode: true,
            pricingModelId: product.pricingModelId, // Pre-provided
          },
          {
            productId: product2.id,
            featureId: featureB.id,
            organizationId: organization.id,
            livemode: true,
            // No pricingModelId - should derive
          },
        ],
        transaction
      )

      expect(productFeatures).toHaveLength(2)
      expect(productFeatures[0]!.pricingModelId).toBe(
        product.pricingModelId
      )
      expect(productFeatures[1]!.pricingModelId).toBe(
        product2.pricingModelId
      )
    })
  })

  it('should throw an error if a product does not exist for derivation', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentProductId = `prod_${core.nanoid()}`

      await expect(
        bulkInsertProductFeatures(
          [
            {
              productId: nonExistentProductId,
              featureId: featureA.id,
              organizationId: organization.id,
              livemode: true,
            },
          ],
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId', () => {
  let product2: Product.Record

  beforeEach(async () => {
    product2 = await setupProduct({
      organizationId: organization.id,
      name: 'Test Product 2',
      pricingModelId: product.pricingModelId,
      livemode: true,
    })
  })

  it('should bulk insert or do nothing for product features', async () => {
    await adminTransaction(async ({ transaction }) => {
      // First insert
      const firstResult =
        await bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId(
          [
            {
              productId: product.id,
              featureId: featureA.id,
              organizationId: organization.id,
              livemode: true,
            },
          ],
          transaction
        )
      expect(firstResult).toHaveLength(1)
      expect(firstResult[0]!.pricingModelId).toBe(
        product.pricingModelId
      )

      // Second insert with same product-feature pair should do nothing
      const secondResult =
        await bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId(
          [
            {
              productId: product.id,
              featureId: featureA.id,
              organizationId: organization.id,
              livemode: true,
            },
          ],
          transaction
        )
      expect(secondResult).toHaveLength(0)
    })
  })

  it('should honor pre-provided pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      const result =
        await bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId(
          [
            {
              productId: product.id,
              featureId: featureA.id,
              organizationId: organization.id,
              livemode: true,
              pricingModelId: product.pricingModelId, // Pre-provided
            },
            {
              productId: product2.id,
              featureId: featureB.id,
              organizationId: organization.id,
              livemode: true,
              // No pricingModelId - should derive
            },
          ],
          transaction
        )

      expect(result).toHaveLength(2)
      expect(result[0]!.pricingModelId).toBe(product.pricingModelId)
      expect(result[1]!.pricingModelId).toBe(product2.pricingModelId)
    })
  })
})
