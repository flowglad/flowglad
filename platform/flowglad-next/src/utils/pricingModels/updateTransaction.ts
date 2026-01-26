/**
 * Main update transaction for pricing models.
 *
 * This module provides the `updatePricingModelTransaction` function that applies
 * diff results to update an existing pricing model and all its child records
 * (usage meters, features, products, prices, productFeatures) in a single database
 * transaction.
 */

import { Result } from 'better-result'
import type { Feature } from '@/db/schema/features'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import type { Resource } from '@/db/schema/resources'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug,
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
  bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug,
  updateResource,
} from '@/db/tableMethods/resourceMethods'
import {
  bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId,
  updateUsageMeter,
} from '@/db/tableMethods/usageMeterMethods'
import type { TransactionEffectsContext } from '@/db/types'
import { NotFoundError, ValidationError } from '@/errors'
import { CurrencyCode, FeatureType, PriceType } from '@/types'
import {
  computeUpdateObject,
  diffPricingModel,
  diffSluggedResources,
} from './diffing'
import { protectDefaultProduct } from './protectDefaultProduct'
import {
  createProductPriceInsert,
  getPricingModelSetupData,
} from './setupHelpers'
import {
  type SetupPricingModelInput,
  validateSetupPricingModelInput,
} from './setupSchemas'
import { externalIdFromProductData } from './setupTransaction'
import {
  resolveExistingIds,
  syncProductFeaturesForMultipleProducts,
} from './updateHelpers'

// Type for ID maps used throughout the update transaction
type IdMaps = {
  usageMeters: Map<string, string>
  features: Map<string, string>
  products: Map<string, string>
  prices: Map<string, string>
  resources: Map<string, string>
}

// Context shared by helper functions
type UpdateContext = {
  pricingModelId: string
  organizationId: string
  livemode: boolean
  currency: CurrencyCode
  ctx: TransactionEffectsContext
}

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
  resources: {
    created: Resource.Record[]
    updated: Resource.Record[]
    deactivated: Resource.Record[]
  }
  productFeatures: {
    added: ProductFeature.Record[]
    removed: ProductFeature.Record[]
  }
}

// Type for usage meter input from SetupPricingModelInput
type UsageMeterWithPricesInput =
  SetupPricingModelInput['usageMeters'][number]
// Type for a single usage price input
type UsagePriceInput = NonNullable<
  UsageMeterWithPricesInput['prices']
>[number]

// Type for usage meter diff from diffPricingModel
type UsageMeterDiff = {
  toCreate: UsageMeterWithPricesInput[]
  toUpdate: Array<{
    existing: UsageMeterWithPricesInput
    proposed: UsageMeterWithPricesInput
    priceDiff: {
      toCreate: UsagePriceInput[]
      toRemove: UsagePriceInput[]
      toUpdate: Array<{
        existing: UsagePriceInput
        proposed: UsagePriceInput
      }>
    }
  }>
}

// Result type for usage meter operations
type UsageMeterOperationsResult = {
  created: UsageMeter.Record[]
  updated: UsageMeter.Record[]
  pricesCreated: Price.Record[]
  pricesDeactivated: Price.Record[]
}

/**
 * Handles all usage meter operations: create new meters with prices,
 * update existing meters, and handle price changes for updated meters.
 */
const handleUsageMeterOperations = async (
  usageMeterDiff: UsageMeterDiff,
  context: UpdateContext,
  idMaps: IdMaps
): Promise<Result<UsageMeterOperationsResult, NotFoundError>> => {
  return Result.gen(async function* () {
    const {
      pricingModelId,
      organizationId,
      livemode,
      currency,
      ctx,
    } = context
    const result: UsageMeterOperationsResult = {
      created: [],
      updated: [],
      pricesCreated: [],
      pricesDeactivated: [],
    }

    // Step 7: Batch create new usage meters
    if (usageMeterDiff.toCreate.length > 0) {
      const usageMeterInserts: UsageMeter.Insert[] =
        usageMeterDiff.toCreate.map((meter) => ({
          slug: meter.usageMeter.slug,
          name: meter.usageMeter.name,
          pricingModelId,
          organizationId,
          livemode,
          ...(meter.usageMeter.aggregationType && {
            aggregationType: meter.usageMeter.aggregationType,
          }),
        }))

      const createdUsageMeters =
        await bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId(
          usageMeterInserts,
          ctx
        )

      result.created = createdUsageMeters
      // Merge newly created usage meter IDs into map
      for (const meter of createdUsageMeters) {
        idMaps.usageMeters.set(meter.slug, meter.id)
      }

      // Step 7a: Create prices for newly created usage meters
      const usageMeterPriceInserts: Price.Insert[] = []
      for (const meterWithPrices of usageMeterDiff.toCreate) {
        const usageMeterId = idMaps.usageMeters.get(
          meterWithPrices.usageMeter.slug
        )
        if (!usageMeterId) {
          return yield* Result.err(
            new NotFoundError(
              'UsageMeter',
              meterWithPrices.usageMeter.slug
            )
          )
        }
        for (const price of meterWithPrices.prices ?? []) {
          usageMeterPriceInserts.push({
            type: PriceType.Usage,
            name: price.name ?? null,
            slug: price.slug ?? null,
            unitPrice: price.unitPrice,
            isDefault: price.isDefault,
            active: price.active,
            intervalCount: price.intervalCount,
            intervalUnit: price.intervalUnit,
            trialPeriodDays: null,
            usageEventsPerUnit: price.usageEventsPerUnit,
            currency,
            productId: null,
            pricingModelId,
            livemode,
            externalId: null,
            usageMeterId,
          })
        }
      }

      if (usageMeterPriceInserts.length > 0) {
        const createdUsagePrices = await bulkInsertPrices(
          usageMeterPriceInserts,
          ctx
        )
        result.pricesCreated.push(...createdUsagePrices)

        // Merge newly created price IDs into map
        for (const price of createdUsagePrices) {
          if (price.slug) {
            idMaps.prices.set(price.slug, price.id)
          }
        }
      }
    }

    // Step 8: Update existing usage meters (parallel)
    const usageMeterUpdatePromises: Promise<UsageMeter.Record>[] = []
    for (const { existing, proposed } of usageMeterDiff.toUpdate) {
      const updateObj = computeUpdateObject(
        existing.usageMeter,
        proposed.usageMeter
      )
      if (Object.keys(updateObj).length === 0) continue

      const meterId = idMaps.usageMeters.get(existing.usageMeter.slug)
      if (!meterId) {
        return yield* Result.err(
          new NotFoundError('UsageMeter', existing.usageMeter.slug)
        )
      }
      usageMeterUpdatePromises.push(
        updateUsageMeter({ id: meterId, ...updateObj }, ctx)
      )
    }

    if (usageMeterUpdatePromises.length > 0) {
      result.updated = await Promise.all(usageMeterUpdatePromises)
    }

    // Step 8a: Handle price changes for updated usage meters
    for (const { existing, priceDiff } of usageMeterDiff.toUpdate) {
      const usageMeterId = idMaps.usageMeters.get(
        existing.usageMeter.slug
      )
      if (!usageMeterId) {
        return yield* Result.err(
          new NotFoundError('UsageMeter', existing.usageMeter.slug)
        )
      }

      // Deactivate removed prices
      for (const priceToRemove of priceDiff.toRemove) {
        const priceId = idMaps.prices.get(priceToRemove.slug ?? '')
        if (priceId) {
          const deactivatedPrice = await updatePrice(
            {
              id: priceId,
              active: false,
              isDefault: false,
              type: PriceType.Usage,
            },
            ctx
          )
          result.pricesDeactivated.push(deactivatedPrice)
        }
      }

      // Create new prices
      if (priceDiff.toCreate.length > 0) {
        const newPriceInserts: Price.Insert[] =
          priceDiff.toCreate.map((price) => ({
            type: PriceType.Usage,
            name: price.name ?? null,
            slug: price.slug ?? null,
            unitPrice: price.unitPrice,
            isDefault: price.isDefault,
            active: price.active,
            intervalCount: price.intervalCount,
            intervalUnit: price.intervalUnit,
            trialPeriodDays: null,
            usageEventsPerUnit: price.usageEventsPerUnit,
            currency,
            productId: null,
            pricingModelId,
            livemode,
            externalId: null,
            usageMeterId,
          }))
        const createdPrices = await bulkInsertPrices(
          newPriceInserts,
          ctx
        )
        result.pricesCreated.push(...createdPrices)

        // Merge into ID map
        for (const price of createdPrices) {
          if (price.slug) {
            idMaps.prices.set(price.slug, price.id)
          }
        }
      }

      // Update existing prices (deactivate old, create new with updated values)
      for (const {
        existing: existingPrice,
        proposed: proposedPrice,
      } of priceDiff.toUpdate) {
        // Skip no-op updates
        const priceUpdateObj = computeUpdateObject(
          existingPrice,
          proposedPrice
        )
        if (Object.keys(priceUpdateObj).length === 0) {
          continue
        }

        const existingPriceId = idMaps.prices.get(
          existingPrice.slug ?? ''
        )
        if (existingPriceId) {
          // Deactivate the old price
          const deactivatedPrice = await updatePrice(
            {
              id: existingPriceId,
              active: false,
              isDefault: false,
              type: PriceType.Usage,
            },
            ctx
          )
          result.pricesDeactivated.push(deactivatedPrice)
        }

        // Create the new price with updated values
        const [newPrice] = await bulkInsertPrices(
          [
            {
              type: PriceType.Usage,
              name: proposedPrice.name ?? null,
              slug: proposedPrice.slug ?? null,
              unitPrice: proposedPrice.unitPrice,
              isDefault: proposedPrice.isDefault,
              active: proposedPrice.active,
              intervalCount: proposedPrice.intervalCount,
              intervalUnit: proposedPrice.intervalUnit,
              trialPeriodDays: null,
              usageEventsPerUnit: proposedPrice.usageEventsPerUnit,
              currency,
              productId: null,
              pricingModelId,
              livemode,
              externalId: null,
              usageMeterId,
            },
          ],
          ctx
        )
        result.pricesCreated.push(newPrice)
        if (newPrice.slug) {
          idMaps.prices.set(newPrice.slug, newPrice.id)
        }
      }
    }

    return Result.ok(result)
  })
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
 * @param ctx - Transaction context including invalidateCache callback
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
  ctx: TransactionEffectsContext
): Promise<
  Result<UpdatePricingModelResult, NotFoundError | ValidationError>
> => {
  return Result.gen(async function* () {
    const { transaction, invalidateCache } = ctx
    // Step 1: Fetch existing pricing model data and organization
    const existingInputResult = await getPricingModelSetupData(
      pricingModelId,
      transaction
    )
    const existingInput = yield* existingInputResult
    const pricingModel = (
      await selectPricingModelById(pricingModelId, transaction)
    ).unwrap()
    const organization = await selectOrganizationById(
      pricingModel.organizationId,
      transaction
    )

    // Step 2: Validate proposed input
    const validatedProposedInput =
      yield* validateSetupPricingModelInput(rawProposedInput)

    // Step 3: Protect default product from invalid modifications
    // This ensures the default product cannot be removed or have protected fields changed
    const proposedInput = yield* protectDefaultProduct(
      existingInput,
      validatedProposedInput
    )

    // Step 4: Compute diff (this also validates the diff)
    const diff = yield* diffPricingModel(existingInput, proposedInput)

    // Step 5: Resolve existing IDs for slug -> id mapping
    const idMaps = await resolveExistingIds(
      pricingModelId,
      transaction
    )

    // Initialize result trackers
    const result: UpdatePricingModelResult = {
      pricingModel,
      features: { created: [], updated: [], deactivated: [] },
      products: { created: [], updated: [], deactivated: [] },
      prices: { created: [], updated: [], deactivated: [] },
      usageMeters: { created: [], updated: [] },
      resources: { created: [], updated: [], deactivated: [] },
      productFeatures: { added: [], removed: [] },
    }

    // Step 6: Update pricing model metadata
    const pricingModelUpdate = computeUpdateObject(
      {
        name: existingInput.name,
        isDefault: existingInput.isDefault,
      },
      { name: proposedInput.name, isDefault: proposedInput.isDefault }
    )
    if (Object.keys(pricingModelUpdate).length > 0) {
      result.pricingModel = await safelyUpdatePricingModel(
        { id: pricingModelId, ...pricingModelUpdate },
        ctx
      )
    }

    // Steps 7-8a: Handle usage meter operations using helper
    const usageMeterOpsResult =
      yield* await handleUsageMeterOperations(
        diff.usageMeters,
        {
          pricingModelId,
          organizationId: pricingModel.organizationId,
          livemode: pricingModel.livemode,
          currency: organization.defaultCurrency,
          ctx,
        },
        idMaps
      )
    result.usageMeters.created = usageMeterOpsResult.created
    result.usageMeters.updated = usageMeterOpsResult.updated
    result.prices.created.push(...usageMeterOpsResult.pricesCreated)
    result.prices.deactivated.push(
      ...usageMeterOpsResult.pricesDeactivated
    )

    /**
     * Step 8b: Handle resources
     *
     * Creates new resources, updates existing ones, and deactivates removed ones.
     * Resources must be processed before features because Resource features
     * need to resolve resourceSlug → resourceId.
     *
     * Note: Resources are optional in the input schema until Patch 1 (setupSchemas)
     * adds them to the discriminated union, so we default to empty arrays.
     */
    type ResourceInput = {
      slug: string
      name: string
      active?: boolean
    }
    const existingResources: ResourceInput[] =
      (existingInput as { resources?: ResourceInput[] }).resources ??
      []
    const proposedResources: ResourceInput[] =
      (proposedInput as { resources?: ResourceInput[] }).resources ??
      []
    const resourceDiff = diffSluggedResources(
      existingResources,
      proposedResources
    )

    // Batch create new resources
    if (resourceDiff.toCreate.length > 0) {
      const resourceInserts: Resource.Insert[] =
        resourceDiff.toCreate.map((resource) => ({
          slug: resource.slug,
          name: resource.name,
          pricingModelId,
          organizationId: pricingModel.organizationId,
          livemode: pricingModel.livemode,
          active: resource.active ?? true,
        }))

      const createdResources =
        await bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug(
          resourceInserts,
          transaction
        )
      result.resources.created = createdResources
      // Merge newly created resource IDs into map
      for (const resource of createdResources) {
        idMaps.resources.set(resource.slug, resource.id)
      }
    }

    // Update existing resources (parallel)
    const resourceUpdatePromises: Promise<Resource.Record>[] = []
    for (const { existing, proposed } of resourceDiff.toUpdate) {
      const updateObj = computeUpdateObject(existing, proposed)
      if (Object.keys(updateObj).length === 0) continue

      const resourceId = idMaps.resources.get(existing.slug)
      if (!resourceId) {
        return yield* Result.err(
          new NotFoundError('Resource', existing.slug)
        )
      }
      resourceUpdatePromises.push(
        updateResource({ id: resourceId, ...updateObj }, transaction)
      )
    }

    if (resourceUpdatePromises.length > 0) {
      result.resources.updated = await Promise.all(
        resourceUpdatePromises
      )
    }

    // Deactivate removed resources (parallel)
    const resourceDeactivatePromises: Promise<Resource.Record>[] = []
    for (const resourceInput of resourceDiff.toRemove) {
      const resourceId = idMaps.resources.get(resourceInput.slug)
      if (!resourceId) {
        return yield* Result.err(
          new NotFoundError('Resource', resourceInput.slug)
        )
      }
      resourceDeactivatePromises.push(
        updateResource({ id: resourceId, active: false }, transaction)
      )
    }

    if (resourceDeactivatePromises.length > 0) {
      result.resources.deactivated = await Promise.all(
        resourceDeactivatePromises
      )
    }

    // Step 9: Batch create new features
    if (diff.features.toCreate.length > 0) {
      const featureInserts: Feature.Insert[] = []
      for (const feature of diff.features.toCreate) {
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
            return yield* Result.err(
              new NotFoundError('UsageMeter', feature.usageMeterSlug)
            )
          }
          featureInserts.push({
            ...coreParams,
            type: FeatureType.UsageCreditGrant,
            usageMeterId,
            resourceId: null,
            amount: feature.amount,
            renewalFrequency: feature.renewalFrequency,
            active: feature.active ?? true,
          })
          continue
        }

        // Handle Resource type
        // Note: This branch requires Patch 1 (setupSchemas) to add Resource to the
        // discriminated union. Until then, we use type assertions to handle the case.
        const featureAsUnknown = feature as unknown as {
          type: string
          resourceSlug?: string
          amount?: number
          active?: boolean
        }
        if (featureAsUnknown.type === FeatureType.Resource) {
          if (!featureAsUnknown.resourceSlug) {
            return yield* Result.err(
              new ValidationError(
                'resourceSlug',
                `Resource feature ${coreParams.slug} requires resourceSlug`
              )
            )
          }
          if (typeof featureAsUnknown.amount !== 'number') {
            return yield* Result.err(
              new ValidationError(
                'amount',
                `Resource feature ${coreParams.slug} requires numeric amount`
              )
            )
          }
          const resourceId = idMaps.resources.get(
            featureAsUnknown.resourceSlug
          )
          if (!resourceId) {
            return yield* Result.err(
              new NotFoundError(
                'Resource',
                featureAsUnknown.resourceSlug
              )
            )
          }
          featureInserts.push({
            ...coreParams,
            type: FeatureType.Resource,
            resourceId,
            usageMeterId: null,
            amount: featureAsUnknown.amount,
            renewalFrequency: null,
            active: featureAsUnknown.active ?? true,
          })
          continue
        }

        // Toggle type (default)
        featureInserts.push({
          ...coreParams,
          type: FeatureType.Toggle,
          usageMeterId: null,
          resourceId: null,
          amount: null,
          renewalFrequency: null,
          active: feature.active ?? true,
        })
      }

      const createdFeatures =
        await bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug(
          featureInserts,
          ctx
        )

      result.features.created = createdFeatures
      // Merge newly created feature IDs into map
      for (const feature of createdFeatures) {
        idMaps.features.set(feature.slug, feature.id)
      }
    }

    // Step 10: Update existing features (parallel)
    const featureUpdatePromises: Promise<Feature.Record>[] = []
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
          return yield* Result.err(
            new NotFoundError('UsageMeter', newSlug)
          )
        }
        transformedUpdate.usageMeterId = newUsageMeterId
        delete transformedUpdate.usageMeterSlug
      }

      // Handle resourceSlug -> resourceId transformation
      // Note: Type assertion needed until Patch 1 adds Resource to the schema
      if ('resourceSlug' in transformedUpdate) {
        const existingType = (existing as unknown as { type: string })
          .type
        if (existingType !== FeatureType.Resource) {
          return yield* Result.err(
            new ValidationError(
              'type',
              `Feature ${existing.slug} has resourceSlug but is type ${existingType}, not Resource`
            )
          )
        }
        const newSlug = transformedUpdate.resourceSlug as string
        const newResourceId = idMaps.resources.get(newSlug)
        if (!newResourceId) {
          return yield* Result.err(
            new NotFoundError('Resource', newSlug)
          )
        }
        transformedUpdate.resourceId = newResourceId
        delete transformedUpdate.resourceSlug
      }

      if (Object.keys(transformedUpdate).length === 0) continue

      const featureId = idMaps.features.get(existing.slug)
      if (!featureId) {
        return yield* Result.err(
          new NotFoundError('Feature', existing.slug)
        )
      }
      featureUpdatePromises.push(
        updateFeature(
          {
            id: featureId,
            type: existing.type,
            ...transformedUpdate,
          },
          ctx
        )
      )
    }

    if (featureUpdatePromises.length > 0) {
      result.features.updated = await Promise.all(
        featureUpdatePromises
      )
    }

    // Step 11: Soft-delete removed features (parallel)
    const featureDeactivatePromises: Promise<Feature.Record>[] = []
    for (const featureInput of diff.features.toRemove) {
      const featureId = idMaps.features.get(featureInput.slug)
      if (!featureId) {
        return yield* Result.err(
          new NotFoundError('Feature', featureInput.slug)
        )
      }
      featureDeactivatePromises.push(
        updateFeature(
          { id: featureId, active: false, type: featureInput.type },
          ctx
        )
      )
    }

    if (featureDeactivatePromises.length > 0) {
      result.features.deactivated = await Promise.all(
        featureDeactivatePromises
      )
    }

    // Step 12: Batch create new products
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
        ctx
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
      const priceInserts: Price.Insert[] = []
      for (const productInput of diff.products.toCreate) {
        const product = productsByExternalId.get(
          externalIdFromProductData(productInput, pricingModelId)
        )
        if (!product) {
          return yield* Result.err(
            new NotFoundError('Product', productInput.product.name)
          )
        }

        // Product prices can only be Subscription or SinglePayment.
        // Usage prices belong to usage meters, not products.
        priceInserts.push(
          createProductPriceInsert(productInput.price, {
            productId: product.id,
            currency: organization.defaultCurrency,
            livemode: pricingModel.livemode,
          })
        )
      }

      const createdPrices = await bulkInsertPrices(priceInserts, ctx)
      result.prices.created = createdPrices

      // Merge newly created price IDs into map
      for (const price of createdPrices) {
        if (price.slug) {
          idMaps.prices.set(price.slug, price.id)
        }
      }
    }

    // Step 13: Update existing products (parallel for metadata)
    // Collect price changes to handle after product updates
    const priceChanges: Array<{
      productId: string
      existingPriceSlug?: string
      proposedPrice: SetupPricingModelInput['products'][number]['price']
    }> = []

    const productUpdatePromises: Promise<Product.Record>[] = []
    for (const { existing, proposed, priceDiff } of diff.products
      .toUpdate) {
      const productId = idMaps.products.get(existing.product.slug)
      if (!productId) {
        return yield* Result.err(
          new NotFoundError('Product', existing.product.slug)
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
      if (Object.keys(productUpdateObj).length === 0) continue

      productUpdatePromises.push(
        updateProduct({ id: productId, ...productUpdateObj }, ctx)
      )
    }

    if (productUpdatePromises.length > 0) {
      result.products.updated = await Promise.all(
        productUpdatePromises
      )
    }

    // Step 14: Handle price changes for existing products
    // First, deactivate old prices (must happen before creating new ones due to slug uniqueness)
    const priceDeactivatePromises: Promise<Price.Record>[] = []
    for (const change of priceChanges) {
      if (!change.existingPriceSlug) continue

      const priceId = idMaps.prices.get(change.existingPriceSlug)
      if (!priceId) {
        return yield* Result.err(
          new NotFoundError('Price', change.existingPriceSlug)
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
        return yield* Result.err(
          new ValidationError(
            'priceType',
            'Could not determine price type for deactivation'
          )
        )
      }
      priceDeactivatePromises.push(
        updatePrice(
          {
            id: priceId,
            active: false,
            isDefault: false,
            type: existingPriceType,
          },
          ctx
        )
      )
    }

    if (priceDeactivatePromises.length > 0) {
      const deactivatedPrices = await Promise.all(
        priceDeactivatePromises
      )
      result.prices.deactivated.push(...deactivatedPrices)
    }

    // Now create new prices for changed products
    // Product prices can only be Subscription or SinglePayment.
    // Usage prices belong to usage meters, not products.
    if (priceChanges.length > 0) {
      const newPriceInserts: Price.Insert[] = priceChanges.map(
        (change) =>
          createProductPriceInsert(change.proposedPrice, {
            productId: change.productId,
            currency: organization.defaultCurrency,
            livemode: pricingModel.livemode,
          })
      )

      const createdPrices = await bulkInsertPrices(
        newPriceInserts,
        ctx
      )
      result.prices.created.push(...createdPrices)

      // Merge newly created price IDs into map
      for (const price of createdPrices) {
        if (price.slug) {
          idMaps.prices.set(price.slug, price.id)
        }
      }
    }

    // Step 15: Soft-delete removed products (parallel)
    const productDeactivatePromises: Promise<Product.Record>[] = []
    for (const productInput of diff.products.toRemove) {
      const productId = idMaps.products.get(productInput.product.slug)
      if (!productId) {
        return yield* Result.err(
          new NotFoundError('Product', productInput.product.slug)
        )
      }
      productDeactivatePromises.push(
        updateProduct({ id: productId, active: false }, ctx)
      )
    }

    if (productDeactivatePromises.length > 0) {
      result.products.deactivated = await Promise.all(
        productDeactivatePromises
      )
    }

    // Step 16: Deactivate prices for removed products (parallel)
    const removedProductPriceDeactivatePromises: Promise<Price.Record>[] =
      []
    for (const productInput of diff.products.toRemove) {
      if (!productInput.price?.slug) continue

      const priceId = idMaps.prices.get(productInput.price.slug)
      if (!priceId) {
        // Price might not exist in map, skip
        continue
      }
      removedProductPriceDeactivatePromises.push(
        updatePrice(
          {
            id: priceId,
            active: false,
            isDefault: false,
            type: productInput.price.type,
          },
          ctx
        )
      )
    }

    if (removedProductPriceDeactivatePromises.length > 0) {
      const deactivatedPrices = await Promise.all(
        removedProductPriceDeactivatePromises
      )
      result.prices.deactivated.push(...deactivatedPrices)
    }

    // Step 17: Sync productFeatures junction table
    const productsWithFeatures: Array<{
      productId: string
      desiredFeatureSlugs: string[]
    }> = []
    for (const productInput of proposedInput.products) {
      const productId = idMaps.products.get(productInput.product.slug)
      if (!productId) {
        return yield* Result.err(
          new NotFoundError('Product', productInput.product.slug)
        )
      }
      productsWithFeatures.push({
        productId,
        desiredFeatureSlugs: productInput.features,
      })
    }

    const productFeaturesResult =
      await syncProductFeaturesForMultipleProducts(
        {
          productsWithFeatures,
          featureSlugToIdMap: idMaps.features,
          organizationId: pricingModel.organizationId,
          livemode: pricingModel.livemode,
        },
        ctx
      )

    result.productFeatures.added = productFeaturesResult.added
    result.productFeatures.removed = productFeaturesResult.removed

    return Result.ok(result)
  })
}
