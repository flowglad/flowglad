/**
 * Main update transaction for pricing models.
 *
 * This module provides the `updatePricingModelTransaction` function that applies
 * diff results to update an existing pricing model and all its child records
 * (usage meters, features, products, prices, productFeatures) in a single database
 * transaction.
 */

import type { Feature } from '@/db/schema/features'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  bulkInsertFeatures,
  updateFeature,
} from '@/db/tableMethods/featureMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  bulkInsertPrices,
  updatePrice,
} from '@/db/tableMethods/priceMethods'
import {
  safelyUpdatePricingModel,
  selectPricingModelById,
} from '@/db/tableMethods/pricingModelMethods'
import {
  bulkInsertProducts,
  updateProduct,
} from '@/db/tableMethods/productMethods'
import {
  bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId,
  updateUsageMeter,
} from '@/db/tableMethods/usageMeterMethods'
import type { DbTransaction } from '@/db/types'
import { FeatureType, PriceType } from '@/types'
import { computeUpdateObject, diffPricingModel } from './diffing'
import { getPricingModelSetupData } from './setupHelpers'
import {
  type SetupPricingModelInput,
  validateSetupPricingModelInput,
} from './setupSchemas'
import { externalIdFromProductData } from './setupTransaction'
import {
  resolveExistingIds,
  syncProductFeaturesForMultipleProducts,
} from './updateHelpers'

/**
 * Result of an update pricing model transaction.
 */
export type UpdatePricingModelResult = {
  pricingModel: PricingModel.Record
  features: {
    created: Feature.Record[]
    updated: Feature.Record[]
    deactivated: Feature.Record[]
  }
  products: {
    created: Product.Record[]
    updated: Product.Record[]
    deactivated: Product.Record[]
  }
  prices: {
    created: Price.Record[]
    updated: Price.Record[]
    deactivated: Price.Record[]
  }
  usageMeters: {
    created: UsageMeter.Record[]
    updated: UsageMeter.Record[]
  }
  productFeatures: {
    added: ProductFeature.Record[]
    removed: ProductFeature.Record[]
  }
}

/**
 * Updates an existing pricing model and all its child records based on the proposed input.
 *
 * This function:
 * 1. Fetches the existing pricing model data
 * 2. Validates the proposed input
 * 3. Computes the diff between existing and proposed states
 * 4. Applies all changes using bulk operations where possible
 * 5. Syncs productFeatures junction table
 *
 * The update order is:
 * - Pricing model metadata (name, isDefault)
 * - Usage meters (batch create new, parallel update existing)
 * - Features (batch create new, parallel update existing, batch soft-delete removed)
 * - Products (batch create new, parallel update existing, batch soft-delete removed)
 * - Prices (batch create for new products, handle changes for existing products)
 * - ProductFeatures (sync junction table)
 *
 * @param params - Configuration object
 * @param params.pricingModelId - ID of the pricing model to update
 * @param params.proposedInput - The proposed new state of the pricing model
 * @param transaction - Database transaction
 * @returns Structured result with all created/updated/deactivated records
 */
export const updatePricingModelTransaction = async (
  {
    pricingModelId,
    proposedInput: rawProposedInput,
  }: {
    pricingModelId: string
    proposedInput: SetupPricingModelInput
  },
  transaction: DbTransaction
): Promise<UpdatePricingModelResult> => {
  // Step 1: Fetch existing pricing model data and organization
  const [existingInput, pricingModel] = await Promise.all([
    getPricingModelSetupData(pricingModelId, transaction),
    selectPricingModelById(pricingModelId, transaction),
  ])
  const organization = await selectOrganizationById(
    pricingModel.organizationId,
    transaction
  )

  // Step 2: Validate proposed input
  const proposedInput =
    validateSetupPricingModelInput(rawProposedInput)

  // Step 3: Compute diff (this also validates the diff)
  const diff = diffPricingModel(existingInput, proposedInput)

  // Step 4: Resolve existing IDs for slug -> id mapping
  const idMaps = await resolveExistingIds(pricingModelId, transaction)

  // Initialize result trackers
  const result: UpdatePricingModelResult = {
    pricingModel,
    features: { created: [], updated: [], deactivated: [] },
    products: { created: [], updated: [], deactivated: [] },
    prices: { created: [], updated: [], deactivated: [] },
    usageMeters: { created: [], updated: [] },
    productFeatures: { added: [], removed: [] },
  }

  // Step 5: Update pricing model metadata
  const pricingModelUpdate = computeUpdateObject(
    { name: existingInput.name, isDefault: existingInput.isDefault },
    { name: proposedInput.name, isDefault: proposedInput.isDefault }
  )
  if (Object.keys(pricingModelUpdate).length > 0) {
    result.pricingModel = await safelyUpdatePricingModel(
      { id: pricingModelId, ...pricingModelUpdate },
      transaction
    )
  }

  // Step 6: Batch create new usage meters
  if (diff.usageMeters.toCreate.length > 0) {
    const usageMeterInserts: UsageMeter.Insert[] =
      diff.usageMeters.toCreate.map((meter) => ({
        slug: meter.slug,
        name: meter.name,
        pricingModelId,
        organizationId: pricingModel.organizationId,
        livemode: pricingModel.livemode,
        ...(meter.aggregationType && {
          aggregationType: meter.aggregationType,
        }),
      }))

    const createdUsageMeters =
      await bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId(
        usageMeterInserts,
        transaction
      )

    result.usageMeters.created = createdUsageMeters
    // Merge newly created usage meter IDs into map
    for (const meter of createdUsageMeters) {
      idMaps.usageMeters.set(meter.slug, meter.id)
    }
  }

  // Step 7: Update existing usage meters (parallel)
  const usageMeterUpdatePromises = diff.usageMeters.toUpdate
    .map(({ existing, proposed }) => {
      const updateObj = computeUpdateObject(existing, proposed)
      if (Object.keys(updateObj).length === 0) return null

      const meterId = idMaps.usageMeters.get(existing.slug)
      if (!meterId) {
        throw new Error(
          `Usage meter ${existing.slug} not found in ID map`
        )
      }
      return updateUsageMeter(
        { id: meterId, ...updateObj },
        transaction
      )
    })
    .filter((p): p is Promise<UsageMeter.Record> => p !== null)

  if (usageMeterUpdatePromises.length > 0) {
    result.usageMeters.updated = await Promise.all(
      usageMeterUpdatePromises
    )
  }

  // Step 8: Batch create new features
  if (diff.features.toCreate.length > 0) {
    const featureInserts: Feature.Insert[] =
      diff.features.toCreate.map((feature) => {
        const coreParams: Pick<
          Feature.Insert,
          | 'slug'
          | 'pricingModelId'
          | 'livemode'
          | 'organizationId'
          | 'name'
          | 'description'
        > = {
          slug: feature.slug,
          name: feature.name,
          description: feature.description,
          pricingModelId,
          livemode: pricingModel.livemode,
          organizationId: pricingModel.organizationId,
        }

        if (feature.type === FeatureType.UsageCreditGrant) {
          const usageMeterId = idMaps.usageMeters.get(
            feature.usageMeterSlug
          )
          if (!usageMeterId) {
            throw new Error(
              `Usage meter ${feature.usageMeterSlug} not found`
            )
          }
          return {
            ...coreParams,
            type: FeatureType.UsageCreditGrant,
            usageMeterId,
            amount: feature.amount,
            renewalFrequency: feature.renewalFrequency,
            active: feature.active ?? true,
          }
        }

        return {
          ...coreParams,
          type: FeatureType.Toggle,
          usageMeterId: null,
          amount: null,
          renewalFrequency: null,
          active: feature.active ?? true,
        }
      })

    const createdFeatures = await bulkInsertFeatures(
      featureInserts,
      transaction
    )

    result.features.created = createdFeatures
    // Merge newly created feature IDs into map
    for (const feature of createdFeatures) {
      idMaps.features.set(feature.slug, feature.id)
    }
  }

  // Step 9: Update existing features (parallel)
  const featureUpdatePromises = diff.features.toUpdate
    .map(({ existing, proposed }) => {
      const updateObj = computeUpdateObject(existing, proposed)
      // Handle usageMeterSlug -> usageMeterId transformation
      const transformedUpdate: Record<string, unknown> = {
        ...updateObj,
      }
      if ('usageMeterSlug' in transformedUpdate) {
        const newSlug = transformedUpdate.usageMeterSlug as string
        const newUsageMeterId = idMaps.usageMeters.get(newSlug)
        if (!newUsageMeterId) {
          throw new Error(`Usage meter ${newSlug} not found`)
        }
        transformedUpdate.usageMeterId = newUsageMeterId
        delete transformedUpdate.usageMeterSlug
      }

      if (Object.keys(transformedUpdate).length === 0) return null

      const featureId = idMaps.features.get(existing.slug)
      if (!featureId) {
        throw new Error(
          `Feature ${existing.slug} not found in ID map`
        )
      }
      return updateFeature(
        { id: featureId, type: existing.type, ...transformedUpdate },
        transaction
      )
    })
    .filter((p): p is Promise<Feature.Record> => p !== null)

  if (featureUpdatePromises.length > 0) {
    result.features.updated = await Promise.all(featureUpdatePromises)
  }

  // Step 10: Soft-delete removed features (parallel)
  const featureDeactivatePromises = diff.features.toRemove.map(
    (featureInput) => {
      const featureId = idMaps.features.get(featureInput.slug)
      if (!featureId) {
        throw new Error(
          `Feature ${featureInput.slug} not found in ID map for deactivation`
        )
      }
      return updateFeature(
        { id: featureId, active: false, type: featureInput.type },
        transaction
      )
    }
  )

  if (featureDeactivatePromises.length > 0) {
    result.features.deactivated = await Promise.all(
      featureDeactivatePromises
    )
  }

  // Step 11: Batch create new products
  if (diff.products.toCreate.length > 0) {
    const productInserts: Product.Insert[] =
      diff.products.toCreate.map((productInput) => ({
        ...productInput.product,
        pricingModelId,
        livemode: pricingModel.livemode,
        organizationId: pricingModel.organizationId,
        externalId: externalIdFromProductData(
          productInput,
          pricingModelId
        ),
      }))

    const createdProducts = await bulkInsertProducts(
      productInserts,
      transaction
    )

    result.products.created = createdProducts

    // Create a map from externalId to product for price creation
    const productsByExternalId = new Map(
      createdProducts.map((p) => [p.externalId, p])
    )

    // Merge newly created product IDs into map
    for (const product of createdProducts) {
      if (product.slug) {
        idMaps.products.set(product.slug, product.id)
      }
    }

    // Batch create prices for new products
    const priceInserts: Price.Insert[] = diff.products.toCreate.map(
      (productInput) => {
        const product = productsByExternalId.get(
          externalIdFromProductData(productInput, pricingModelId)
        )
        if (!product) {
          throw new Error(
            `Product ${productInput.product.name} not found`
          )
        }

        const price = productInput.price
        switch (price.type) {
          case PriceType.Usage: {
            const usageMeterId = idMaps.usageMeters.get(
              price.usageMeterSlug
            )
            if (!usageMeterId) {
              throw new Error(
                `Usage meter ${price.usageMeterSlug} not found`
              )
            }
            return {
              type: PriceType.Usage,
              name: price.name ?? null,
              slug: price.slug ?? null,
              unitPrice: price.unitPrice,
              isDefault: price.isDefault,
              active: price.active,
              intervalCount: price.intervalCount,
              intervalUnit: price.intervalUnit,
              trialPeriodDays: price.trialPeriodDays,
              usageEventsPerUnit: price.usageEventsPerUnit,
              currency: organization.defaultCurrency,
              productId: product.id,
              livemode: pricingModel.livemode,
              externalId: null,
              usageMeterId,
            }
          }

          case PriceType.Subscription:
            return {
              type: PriceType.Subscription,
              name: price.name ?? null,
              slug: price.slug ?? null,
              unitPrice: price.unitPrice,
              isDefault: price.isDefault,
              active: price.active,
              intervalCount: price.intervalCount,
              intervalUnit: price.intervalUnit,
              trialPeriodDays: price.trialPeriodDays,
              usageEventsPerUnit: price.usageEventsPerUnit ?? null,
              currency: organization.defaultCurrency,
              productId: product.id,
              livemode: pricingModel.livemode,
              externalId: null,
              usageMeterId: null,
            }

          case PriceType.SinglePayment:
            return {
              type: PriceType.SinglePayment,
              name: price.name ?? null,
              slug: price.slug ?? null,
              unitPrice: price.unitPrice,
              isDefault: price.isDefault,
              active: price.active,
              intervalCount: null,
              intervalUnit: null,
              trialPeriodDays: price.trialPeriodDays ?? null,
              usageEventsPerUnit: price.usageEventsPerUnit ?? null,
              currency: organization.defaultCurrency,
              productId: product.id,
              livemode: pricingModel.livemode,
              externalId: null,
              usageMeterId: null,
            }

          default:
            throw new Error(
              `Unknown or unhandled price type: ${price}`
            )
        }
      }
    )

    const createdPrices = await bulkInsertPrices(
      priceInserts,
      transaction
    )
    result.prices.created = createdPrices

    // Merge newly created price IDs into map
    for (const price of createdPrices) {
      if (price.slug) {
        idMaps.prices.set(price.slug, price.id)
      }
    }
  }

  // Step 12: Update existing products (parallel for metadata)
  // Collect price changes to handle after product updates
  const priceChanges: Array<{
    productId: string
    existingPriceSlug?: string
    proposedPrice: SetupPricingModelInput['products'][number]['price']
  }> = []

  const productUpdatePromises = diff.products.toUpdate
    .map(({ existing, proposed, priceDiff }) => {
      const productId = idMaps.products.get(existing.product.slug)
      if (!productId) {
        throw new Error(
          `Product ${existing.product.slug} not found in ID map`
        )
      }

      // Track price changes for later
      if (priceDiff) {
        priceChanges.push({
          productId,
          existingPriceSlug: priceDiff.existingPrice?.slug,
          proposedPrice: proposed.price,
        })
      }

      // Update product metadata
      const productUpdateObj = computeUpdateObject(
        existing.product,
        proposed.product
      )
      if (Object.keys(productUpdateObj).length === 0) return null

      return updateProduct(
        { id: productId, ...productUpdateObj },
        transaction
      )
    })
    .filter((p): p is Promise<Product.Record> => p !== null)

  if (productUpdatePromises.length > 0) {
    result.products.updated = await Promise.all(productUpdatePromises)
  }

  // Step 13: Handle price changes for existing products
  // First, deactivate old prices (must happen before creating new ones due to slug uniqueness)
  const priceDeactivatePromises = priceChanges
    .filter((change) => change.existingPriceSlug)
    .map((change) => {
      const priceId = idMaps.prices.get(change.existingPriceSlug!)
      if (!priceId) {
        throw new Error(
          `Price ${change.existingPriceSlug} not found in ID map`
        )
      }
      // We need the type for the update, get it from the existing price in diff
      const existingProduct = diff.products.toUpdate.find(
        (p) =>
          idMaps.products.get(p.existing.product.slug) ===
          change.productId
      )
      const existingPriceType =
        existingProduct?.priceDiff?.existingPrice?.type
      if (!existingPriceType) {
        throw new Error(
          `Could not determine price type for deactivation`
        )
      }
      return updatePrice(
        {
          id: priceId,
          active: false,
          isDefault: false,
          type: existingPriceType,
        },
        transaction
      )
    })

  if (priceDeactivatePromises.length > 0) {
    const deactivatedPrices = await Promise.all(
      priceDeactivatePromises
    )
    result.prices.deactivated.push(...deactivatedPrices)
  }

  // Now create new prices for changed products
  if (priceChanges.length > 0) {
    const newPriceInserts: Price.Insert[] = priceChanges.map(
      (change) => {
        const price = change.proposedPrice
        switch (price.type) {
          case PriceType.Usage: {
            const usageMeterId = idMaps.usageMeters.get(
              price.usageMeterSlug
            )
            if (!usageMeterId) {
              throw new Error(
                `Usage meter ${price.usageMeterSlug} not found`
              )
            }
            return {
              type: PriceType.Usage,
              name: price.name ?? null,
              slug: price.slug ?? null,
              unitPrice: price.unitPrice,
              isDefault: price.isDefault,
              active: price.active,
              intervalCount: price.intervalCount,
              intervalUnit: price.intervalUnit,
              trialPeriodDays: price.trialPeriodDays,
              usageEventsPerUnit: price.usageEventsPerUnit,
              currency: organization.defaultCurrency,
              productId: change.productId,
              livemode: pricingModel.livemode,
              externalId: null,
              usageMeterId,
            }
          }

          case PriceType.Subscription:
            return {
              type: PriceType.Subscription,
              name: price.name ?? null,
              slug: price.slug ?? null,
              unitPrice: price.unitPrice,
              isDefault: price.isDefault,
              active: price.active,
              intervalCount: price.intervalCount,
              intervalUnit: price.intervalUnit,
              trialPeriodDays: price.trialPeriodDays,
              usageEventsPerUnit: price.usageEventsPerUnit ?? null,
              currency: organization.defaultCurrency,
              productId: change.productId,
              livemode: pricingModel.livemode,
              externalId: null,
              usageMeterId: null,
            }

          case PriceType.SinglePayment:
            return {
              type: PriceType.SinglePayment,
              name: price.name ?? null,
              slug: price.slug ?? null,
              unitPrice: price.unitPrice,
              isDefault: price.isDefault,
              active: price.active,
              intervalCount: null,
              intervalUnit: null,
              trialPeriodDays: price.trialPeriodDays ?? null,
              usageEventsPerUnit: price.usageEventsPerUnit ?? null,
              currency: organization.defaultCurrency,
              productId: change.productId,
              livemode: pricingModel.livemode,
              externalId: null,
              usageMeterId: null,
            }

          default:
            throw new Error(
              `Unknown or unhandled price type: ${price}`
            )
        }
      }
    )

    const createdPrices = await bulkInsertPrices(
      newPriceInserts,
      transaction
    )
    result.prices.created.push(...createdPrices)

    // Merge newly created price IDs into map
    for (const price of createdPrices) {
      if (price.slug) {
        idMaps.prices.set(price.slug, price.id)
      }
    }
  }

  // Step 14: Soft-delete removed products (parallel)
  const productDeactivatePromises = diff.products.toRemove.map(
    (productInput) => {
      const productId = idMaps.products.get(productInput.product.slug)
      if (!productId) {
        throw new Error(
          `Product ${productInput.product.slug} not found in ID map for deactivation`
        )
      }
      return updateProduct(
        { id: productId, active: false },
        transaction
      )
    }
  )

  if (productDeactivatePromises.length > 0) {
    result.products.deactivated = await Promise.all(
      productDeactivatePromises
    )
  }

  // Step 15: Deactivate prices for removed products (parallel)
  const removedProductPriceDeactivatePromises = diff.products.toRemove
    .filter((productInput) => productInput.price?.slug)
    .map((productInput) => {
      const priceId = idMaps.prices.get(productInput.price!.slug!)
      if (!priceId) {
        // Price might not exist in map, skip
        return null
      }
      return updatePrice(
        {
          id: priceId,
          active: false,
          isDefault: false,
          type: productInput.price!.type,
        },
        transaction
      )
    })
    .filter((p): p is Promise<Price.Record> => p !== null)

  if (removedProductPriceDeactivatePromises.length > 0) {
    const deactivatedPrices = await Promise.all(
      removedProductPriceDeactivatePromises
    )
    result.prices.deactivated.push(...deactivatedPrices)
  }

  // Step 16: Sync productFeatures junction table
  const productsWithFeatures = proposedInput.products.map(
    (productInput) => {
      const productId = idMaps.products.get(productInput.product.slug)
      if (!productId) {
        throw new Error(
          `Product ${productInput.product.slug} not found in ID map for productFeature sync`
        )
      }
      return {
        productId,
        desiredFeatureSlugs: productInput.features,
      }
    }
  )

  const productFeaturesResult =
    await syncProductFeaturesForMultipleProducts(
      {
        productsWithFeatures,
        featureSlugToIdMap: idMaps.features,
        organizationId: pricingModel.organizationId,
        livemode: pricingModel.livemode,
      },
      transaction
    )

  result.productFeatures.added = productFeaturesResult.added
  result.productFeatures.removed = productFeaturesResult.removed

  return result
}
