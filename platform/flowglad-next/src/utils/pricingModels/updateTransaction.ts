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
  insertPrice,
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
import { type CurrencyCode, FeatureType, PriceType } from '@/types'
import {
  computeUpdateObject,
  diffPricingModel,
  type PricingModelDiffResult,
  type ProductDiffResult,
} from './diffing'
import { getPricingModelSetupData } from './setupHelpers'
import {
  type SetupPricingModelInput,
  type SetupPricingModelProductInput,
  type SetupPricingModelProductPriceInput,
  validateSetupPricingModelInput,
} from './setupSchemas'
import { externalIdFromProductData } from './setupTransaction'
import {
  type ResolvedPricingModelIds,
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
 * Creates a new usage meter within a pricing model.
 */
const createUsageMeter = async (
  input: SetupPricingModelInput['usageMeters'][number],
  {
    pricingModelId,
    organizationId,
    livemode,
  }: {
    pricingModelId: string
    organizationId: string
    livemode: boolean
  },
  transaction: DbTransaction
): Promise<UsageMeter.Record> => {
  const [created] =
    await bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId(
      [
        {
          slug: input.slug,
          name: input.name,
          pricingModelId,
          organizationId,
          livemode,
          ...(input.aggregationType && {
            aggregationType: input.aggregationType,
          }),
        },
      ],
      transaction
    )
  return created
}

/**
 * Creates a new feature within a pricing model.
 */
const createFeature = async (
  input: SetupPricingModelInput['features'][number],
  {
    pricingModelId,
    organizationId,
    livemode,
    usageMeterSlugToIdMap,
  }: {
    pricingModelId: string
    organizationId: string
    livemode: boolean
    usageMeterSlugToIdMap: Map<string, string>
  },
  transaction: DbTransaction
): Promise<Feature.Record> => {
  const coreParams: Pick<
    Feature.Insert,
    | 'slug'
    | 'pricingModelId'
    | 'livemode'
    | 'organizationId'
    | 'name'
    | 'description'
  > = {
    slug: input.slug,
    name: input.name,
    description: input.description,
    pricingModelId,
    livemode,
    organizationId,
  }

  let featureInsert: Feature.Insert
  if (input.type === FeatureType.UsageCreditGrant) {
    const usageMeterId = usageMeterSlugToIdMap.get(
      input.usageMeterSlug
    )
    if (!usageMeterId) {
      throw new Error(`Usage meter ${input.usageMeterSlug} not found`)
    }
    featureInsert = {
      ...coreParams,
      type: FeatureType.UsageCreditGrant,
      usageMeterId,
      amount: input.amount,
      renewalFrequency: input.renewalFrequency,
      active: input.active ?? true,
    }
  } else {
    featureInsert = {
      ...coreParams,
      type: FeatureType.Toggle,
      usageMeterId: null,
      amount: null,
      renewalFrequency: null,
      active: input.active ?? true,
    }
  }

  const [created] = await bulkInsertFeatures(
    [featureInsert],
    transaction
  )
  return created
}

/**
 * Creates a price insert object from a price input definition.
 */
const buildPriceInsert = (
  priceInput: SetupPricingModelProductPriceInput,
  {
    productId,
    currency,
    livemode,
    usageMeterSlugToIdMap,
  }: {
    productId: string
    currency: CurrencyCode
    livemode: boolean
    usageMeterSlugToIdMap: Map<string, string>
  }
): Price.Insert => {
  switch (priceInput.type) {
    case PriceType.Usage: {
      const usageMeterId = usageMeterSlugToIdMap.get(
        priceInput.usageMeterSlug
      )
      if (!usageMeterId) {
        throw new Error(
          `Usage meter ${priceInput.usageMeterSlug} not found`
        )
      }
      return {
        type: PriceType.Usage,
        name: priceInput.name ?? null,
        slug: priceInput.slug ?? null,
        unitPrice: priceInput.unitPrice,
        isDefault: priceInput.isDefault,
        active: priceInput.active,
        intervalCount: priceInput.intervalCount,
        intervalUnit: priceInput.intervalUnit,
        trialPeriodDays: priceInput.trialPeriodDays,
        usageEventsPerUnit: priceInput.usageEventsPerUnit,
        currency,
        productId,
        livemode,
        externalId: null,
        usageMeterId,
      }
    }

    case PriceType.Subscription:
      return {
        type: PriceType.Subscription,
        name: priceInput.name ?? null,
        slug: priceInput.slug ?? null,
        unitPrice: priceInput.unitPrice,
        isDefault: priceInput.isDefault,
        active: priceInput.active,
        intervalCount: priceInput.intervalCount,
        intervalUnit: priceInput.intervalUnit,
        trialPeriodDays: priceInput.trialPeriodDays,
        usageEventsPerUnit: priceInput.usageEventsPerUnit ?? null,
        currency,
        productId,
        livemode,
        externalId: null,
        usageMeterId: null,
      }

    case PriceType.SinglePayment:
      return {
        type: PriceType.SinglePayment,
        name: priceInput.name ?? null,
        slug: priceInput.slug ?? null,
        unitPrice: priceInput.unitPrice,
        isDefault: priceInput.isDefault,
        active: priceInput.active,
        intervalCount: null,
        intervalUnit: null,
        trialPeriodDays: priceInput.trialPeriodDays ?? null,
        usageEventsPerUnit: priceInput.usageEventsPerUnit ?? null,
        currency,
        productId,
        livemode,
        externalId: null,
        usageMeterId: null,
      }

    default:
      throw new Error(
        `Unknown or unhandled price type: ${(priceInput as SetupPricingModelProductPriceInput).type}`
      )
  }
}

/**
 * Creates a new product with its price within a pricing model.
 */
const createProduct = async (
  input: SetupPricingModelProductInput,
  {
    pricingModelId,
    organizationId,
    livemode,
    currency,
    usageMeterSlugToIdMap,
  }: {
    pricingModelId: string
    organizationId: string
    livemode: boolean
    currency: CurrencyCode
    usageMeterSlugToIdMap: Map<string, string>
  },
  transaction: DbTransaction
): Promise<{ product: Product.Record; price: Price.Record }> => {
  const [product] = await bulkInsertProducts(
    [
      {
        ...input.product,
        pricingModelId,
        livemode,
        organizationId,
        externalId: externalIdFromProductData(input, pricingModelId),
      },
    ],
    transaction
  )

  const priceInsert = buildPriceInsert(input.price, {
    productId: product.id,
    currency,
    livemode,
    usageMeterSlugToIdMap,
  })

  const price = await insertPrice(priceInsert, transaction)

  return { product, price }
}

/**
 * Handles price changes for a product update.
 *
 * When a price changes:
 * 1. Creates a new price with the proposed values (active=true, isDefault=true)
 * 2. Deactivates the old price (active=false, isDefault=false)
 *
 * This maintains historical records and ensures existing subscriptions
 * continue using their snapshotted prices.
 */
const handlePriceChange = async (
  {
    existingPrice,
    proposedPrice,
    productId,
    currency,
    livemode,
    usageMeterSlugToIdMap,
    existingPriceId,
  }: {
    existingPrice?: SetupPricingModelProductPriceInput
    proposedPrice?: SetupPricingModelProductPriceInput
    productId: string
    currency: CurrencyCode
    livemode: boolean
    usageMeterSlugToIdMap: Map<string, string>
    existingPriceId?: string
  },
  transaction: DbTransaction
): Promise<{
  createdPrice?: Price.Record
  deactivatedPrice?: Price.Record
}> => {
  // Case 1: Adding a price where there was none
  if (!existingPrice && proposedPrice) {
    const priceInsert = buildPriceInsert(proposedPrice, {
      productId,
      currency,
      livemode,
      usageMeterSlugToIdMap,
    })
    const createdPrice = await insertPrice(priceInsert, transaction)
    return { createdPrice }
  }

  // Case 2: Removing a price (soft delete)
  if (existingPrice && !proposedPrice && existingPriceId) {
    const deactivatedPrice = await updatePrice(
      {
        id: existingPriceId,
        active: false,
        isDefault: false,
        type: existingPrice.type,
      },
      transaction
    )
    return { deactivatedPrice }
  }

  // Case 3: Updating an existing price
  if (existingPrice && proposedPrice && existingPriceId) {
    // IMPORTANT: Deactivate old price FIRST to avoid unique constraint violation
    // (slug uniqueness is scoped to active prices within a pricing model)
    const deactivatedPrice = await updatePrice(
      {
        id: existingPriceId,
        active: false,
        isDefault: false,
        type: existingPrice.type,
      },
      transaction
    )

    // Create new price with proposed values (now safe since old price is inactive)
    const priceInsert = buildPriceInsert(proposedPrice, {
      productId,
      currency,
      livemode,
      usageMeterSlugToIdMap,
    })
    const createdPrice = await insertPrice(priceInsert, transaction)

    return { createdPrice, deactivatedPrice }
  }

  return {}
}

/**
 * Updates an existing pricing model and all its child records based on the proposed input.
 *
 * This function:
 * 1. Fetches the existing pricing model data
 * 2. Validates the proposed input
 * 3. Computes the diff between existing and proposed states
 * 4. Applies all changes in a specific order to maintain referential integrity
 * 5. Syncs productFeatures junction table
 *
 * The update order is:
 * - Pricing model metadata (name, isDefault)
 * - Usage meters (create new, update existing)
 * - Features (create new, update existing, soft-delete removed)
 * - Products (create new with prices, update existing, soft-delete removed)
 * - Prices (create new for changed prices, deactivate old)
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
  // Step 1: Fetch existing pricing model data
  const existingInput = await getPricingModelSetupData(
    pricingModelId,
    transaction
  )
  const pricingModel = await selectPricingModelById(
    pricingModelId,
    transaction
  )
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

  // Step 6: Create new usage meters
  for (const meterInput of diff.usageMeters.toCreate) {
    const created = await createUsageMeter(
      meterInput,
      {
        pricingModelId,
        organizationId: pricingModel.organizationId,
        livemode: pricingModel.livemode,
      },
      transaction
    )
    result.usageMeters.created.push(created)
    // Merge newly created usage meter ID into map
    idMaps.usageMeters.set(created.slug, created.id)
  }

  // Step 7: Update existing usage meters
  for (const { existing, proposed } of diff.usageMeters.toUpdate) {
    const updateObj = computeUpdateObject(existing, proposed)
    if (Object.keys(updateObj).length > 0) {
      const meterId = idMaps.usageMeters.get(existing.slug)
      if (!meterId) {
        throw new Error(
          `Usage meter ${existing.slug} not found in ID map`
        )
      }
      const updated = await updateUsageMeter(
        { id: meterId, ...updateObj },
        transaction
      )
      result.usageMeters.updated.push(updated)
    }
  }

  // Step 8: Create new features
  for (const featureInput of diff.features.toCreate) {
    const created = await createFeature(
      featureInput,
      {
        pricingModelId,
        organizationId: pricingModel.organizationId,
        livemode: pricingModel.livemode,
        usageMeterSlugToIdMap: idMaps.usageMeters,
      },
      transaction
    )
    result.features.created.push(created)
    // Merge newly created feature ID into map
    idMaps.features.set(created.slug, created.id)
  }

  // Step 9: Update existing features
  for (const { existing, proposed } of diff.features.toUpdate) {
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

    if (Object.keys(transformedUpdate).length > 0) {
      const featureId = idMaps.features.get(existing.slug)
      if (!featureId) {
        throw new Error(
          `Feature ${existing.slug} not found in ID map`
        )
      }
      const updated = await updateFeature(
        { id: featureId, type: existing.type, ...transformedUpdate },
        transaction
      )
      result.features.updated.push(updated)
    }
  }

  // Step 10: Soft-delete removed features
  for (const featureInput of diff.features.toRemove) {
    const featureId = idMaps.features.get(featureInput.slug)
    if (!featureId) {
      throw new Error(
        `Feature ${featureInput.slug} not found in ID map for deactivation`
      )
    }
    const deactivated = await updateFeature(
      { id: featureId, active: false, type: featureInput.type },
      transaction
    )
    result.features.deactivated.push(deactivated)
  }

  // Step 11: Create new products with prices
  for (const productInput of diff.products.toCreate) {
    const { product, price } = await createProduct(
      productInput,
      {
        pricingModelId,
        organizationId: pricingModel.organizationId,
        livemode: pricingModel.livemode,
        currency: organization.defaultCurrency,
        usageMeterSlugToIdMap: idMaps.usageMeters,
      },
      transaction
    )
    result.products.created.push(product)
    result.prices.created.push(price)
    // Merge newly created product ID into map
    idMaps.products.set(product.slug!, product.id)
    // Merge newly created price ID into map if it has a slug
    if (price.slug) {
      idMaps.prices.set(price.slug, price.id)
    }
  }

  // Step 12: Update existing products
  for (const { existing, proposed, priceDiff } of diff.products
    .toUpdate) {
    const productId = idMaps.products.get(existing.product.slug)
    if (!productId) {
      throw new Error(
        `Product ${existing.product.slug} not found in ID map`
      )
    }

    // Update product metadata
    const productUpdateObj = computeUpdateObject(
      existing.product,
      proposed.product
    )
    if (Object.keys(productUpdateObj).length > 0) {
      const updated = await updateProduct(
        { id: productId, ...productUpdateObj },
        transaction
      )
      result.products.updated.push(updated)
    }

    // Handle price changes if there's a price diff
    if (priceDiff) {
      // Get existing price ID from the price slug map
      let existingPriceId: string | undefined
      if (priceDiff.existingPrice?.slug) {
        existingPriceId = idMaps.prices.get(
          priceDiff.existingPrice.slug
        )
      }

      const priceChangeResult = await handlePriceChange(
        {
          existingPrice: priceDiff.existingPrice,
          proposedPrice: priceDiff.proposedPrice,
          productId,
          currency: organization.defaultCurrency,
          livemode: pricingModel.livemode,
          usageMeterSlugToIdMap: idMaps.usageMeters,
          existingPriceId,
        },
        transaction
      )

      if (priceChangeResult.createdPrice) {
        result.prices.created.push(priceChangeResult.createdPrice)
        // Merge newly created price ID into map if it has a slug
        if (priceChangeResult.createdPrice.slug) {
          idMaps.prices.set(
            priceChangeResult.createdPrice.slug,
            priceChangeResult.createdPrice.id
          )
        }
      }
      if (priceChangeResult.deactivatedPrice) {
        result.prices.deactivated.push(
          priceChangeResult.deactivatedPrice
        )
      }
    }
  }

  // Step 13: Soft-delete removed products (and their prices)
  for (const productInput of diff.products.toRemove) {
    const productId = idMaps.products.get(productInput.product.slug)
    if (!productId) {
      throw new Error(
        `Product ${productInput.product.slug} not found in ID map for deactivation`
      )
    }

    const deactivatedProduct = await updateProduct(
      { id: productId, active: false },
      transaction
    )
    result.products.deactivated.push(deactivatedProduct)

    // Also deactivate the product's price if it has one
    if (productInput.price?.slug) {
      const priceId = idMaps.prices.get(productInput.price.slug)
      if (priceId) {
        const deactivatedPrice = await updatePrice(
          {
            id: priceId,
            active: false,
            isDefault: false,
            type: productInput.price.type,
          },
          transaction
        )
        result.prices.deactivated.push(deactivatedPrice)
      }
    }
  }

  // Step 14: Sync productFeatures junction table
  // Build the list of products with their desired feature slugs from the proposed input
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
