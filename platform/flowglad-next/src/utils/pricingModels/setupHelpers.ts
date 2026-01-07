import { selectFeatures } from '@/db/tableMethods/featureMethods'
import {
  selectPrices,
  selectPricesAndProductsByProductWhere,
} from '@/db/tableMethods/priceMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { selectFeaturesByProductFeatureWhere } from '@/db/tableMethods/productFeatureMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import type { DbTransaction } from '@/db/types'
import { FeatureType, PriceType } from '@/types'
import {
  type SetupPricingModelInput,
  validateSetupPricingModelInput,
} from './setupSchemas'

/**
 * Fetches a pricing model and all its related records (usage meters, features, products, prices)
 * and transforms them into the format expected by setupPricingModelSchema.
 *
 * This function is useful for cloning pricing models or exporting pricing model configurations.
 *
 * @param pricingModelId - The ID of the pricing model to fetch
 * @param transaction - The database transaction to use
 * @returns The pricing model data in setupPricingModelSchema format
 */
export async function getPricingModelSetupData(
  pricingModelId: string,
  transaction: DbTransaction
): Promise<SetupPricingModelInput> {
  // Fetch the pricing model
  const pricingModel = await selectPricingModelById(
    pricingModelId,
    transaction
  )

  if (!pricingModel) {
    throw new Error(`Pricing model ${pricingModelId} not found`)
  }

  // Fetch all usage meters for this pricing model
  const usageMeters = await selectUsageMeters(
    { pricingModelId: pricingModel.id },
    transaction
  )

  // Create a map of usage meter IDs to slugs for later transformation
  const usageMeterIdToSlug = new Map(
    usageMeters.map((meter) => [meter.id, meter.slug])
  )

  // Fetch all features for this pricing model
  const features = await selectFeatures(
    { pricingModelId: pricingModel.id, active: true },
    transaction
  )

  // Create a map of feature IDs to slugs for later transformation
  const featureIdToSlug = new Map(
    features.map((feature) => [feature.id, feature.slug])
  )

  // Fetch all products with prices for this pricing model
  const productsWithPrices =
    await selectPricesAndProductsByProductWhere(
      { pricingModelId: pricingModel.id },
      transaction
    )

  // Check each product has a non-null and non-empty slug
  for (const product of productsWithPrices) {
    if (!product.slug) {
      throw new Error(
        `Product ${product.name} (ID: ${product.id}) has no slug`
      )
    }
  }

  // Fetch usage prices that don't have products (productId: null)
  // These are associated with usage meters directly
  const allPrices = await selectPrices(
    { pricingModelId: pricingModel.id, active: true },
    transaction
  )
  const usagePricesWithoutProducts = allPrices.filter(
    (price) =>
      price.type === PriceType.Usage && price.productId === null
  )

  // Fetch all product-feature relationships
  const productIds = productsWithPrices.map((p) => p.id)
  const productFeaturesWithFeatures = (
    productIds.length > 0
      ? await selectFeaturesByProductFeatureWhere(
          { productId: productIds },
          transaction
        )
      : []
  ).filter(({ feature }) => feature.active)

  // Group product features by product ID
  const featureSlugsByProductId = new Map<string, string[]>()
  for (const {
    productFeature,
    feature,
  } of productFeaturesWithFeatures) {
    const existing =
      featureSlugsByProductId.get(productFeature.productId) || []
    featureSlugsByProductId.set(productFeature.productId, [
      ...existing,
      feature.slug,
    ])
  }

  // Transform usage meters (omit pricingModelId)
  const transformedUsageMeters = usageMeters.map((meter) => ({
    slug: meter.slug,
    name: meter.name,
    aggregationType: meter.aggregationType,
  }))

  // Transform features (omit pricingModelId, replace usageMeterId with usageMeterSlug)
  const transformedFeatures = features.map((feature) => {
    if (feature.type === FeatureType.UsageCreditGrant) {
      if (!feature.usageMeterId) {
        throw new Error(
          `Feature ${feature.slug} is a UsageCreditGrant but has no usageMeterId`
        )
      }
      const usageMeterSlug = usageMeterIdToSlug.get(
        feature.usageMeterId
      )
      if (!usageMeterSlug) {
        throw new Error(
          `Usage meter with ID ${feature.usageMeterId} not found`
        )
      }
      return {
        type: FeatureType.UsageCreditGrant as const,
        slug: feature.slug,
        name: feature.name,
        description: feature.description,
        usageMeterSlug,
        amount: feature.amount!,
        renewalFrequency: feature.renewalFrequency!,
        active: feature.active,
      }
    } else {
      return {
        type: FeatureType.Toggle as const,
        slug: feature.slug,
        name: feature.name,
        description: feature.description,
        active: feature.active,
      }
    }
  })

  // Transform products with prices (omit pricingModelId from product, productId from prices)
  const transformedProducts = productsWithPrices.map(
    ({ prices, ...product }) => {
      // Find the single active default price
      const activeDefaultPrice = prices.find(
        (price) => price.active && price.isDefault
      )

      if (!activeDefaultPrice) {
        throw new Error(
          `Product ${product.name} has no active default price`
        )
      }

      // Base price fields common to all price types
      const basePrice = {
        name: activeDefaultPrice.name ?? undefined,
        slug: activeDefaultPrice.slug ?? undefined,
        unitPrice: activeDefaultPrice.unitPrice,
        isDefault: activeDefaultPrice.isDefault,
        active: activeDefaultPrice.active,
      }

      let transformedPrice

      if (activeDefaultPrice.type === PriceType.Usage) {
        if (!activeDefaultPrice.usageMeterId) {
          throw new Error(
            `Price ${activeDefaultPrice.id} is a Usage price but has no usageMeterId`
          )
        }
        const usageMeterSlug = usageMeterIdToSlug.get(
          activeDefaultPrice.usageMeterId
        )
        if (!usageMeterSlug) {
          throw new Error(
            `Usage meter with ID ${activeDefaultPrice.usageMeterId} not found`
          )
        }
        transformedPrice = {
          ...basePrice,
          type: PriceType.Usage as const,
          usageMeterSlug,
          intervalCount: activeDefaultPrice.intervalCount!,
          intervalUnit: activeDefaultPrice.intervalUnit!,
          usageEventsPerUnit: activeDefaultPrice.usageEventsPerUnit!,
          trialPeriodDays: null,
        }
      } else if (activeDefaultPrice.type === PriceType.Subscription) {
        transformedPrice = {
          ...basePrice,
          type: PriceType.Subscription as const,
          intervalCount: activeDefaultPrice.intervalCount!,
          intervalUnit: activeDefaultPrice.intervalUnit!,
          trialPeriodDays:
            activeDefaultPrice.trialPeriodDays ?? undefined,
          usageMeterId: null,
          usageEventsPerUnit: null,
        }
      } else if (
        activeDefaultPrice.type === PriceType.SinglePayment
      ) {
        transformedPrice = {
          ...basePrice,
          type: PriceType.SinglePayment as const,
          trialPeriodDays:
            activeDefaultPrice.trialPeriodDays ?? undefined,
        }
      } else {
        throw new Error(
          `Unknown price type: ${(activeDefaultPrice as any).type}`
        )
      }

      return {
        product: {
          name: product.name,
          slug: product.slug as string,
          description: product.description ?? undefined,
          imageURL: product.imageURL ?? undefined,
          default: product.default,
          active: product.active,
          singularQuantityLabel:
            product.singularQuantityLabel ?? undefined,
          pluralQuantityLabel:
            product.pluralQuantityLabel ?? undefined,
        },
        price: transformedPrice,
        features: featureSlugsByProductId.get(product.id) || [],
      }
    }
  )

  // Create virtual products for usage prices that don't have real products
  // This maintains the schema structure where every usage meter needs a usage price
  const virtualProductsForUsagePrices =
    usagePricesWithoutProducts.map((price) => {
      if (!price.usageMeterId) {
        throw new Error(`Usage price ${price.id} has no usageMeterId`)
      }
      const usageMeterSlug = usageMeterIdToSlug.get(
        price.usageMeterId
      )
      if (!usageMeterSlug) {
        throw new Error(
          `Usage meter with ID ${price.usageMeterId} not found`
        )
      }
      return {
        product: {
          name: price.name ?? usageMeterSlug,
          slug: price.slug ?? usageMeterSlug,
          default: false,
          active: price.active,
        },
        price: {
          type: PriceType.Usage as const,
          name: price.name ?? undefined,
          slug: price.slug ?? undefined,
          unitPrice: price.unitPrice,
          isDefault: price.isDefault,
          active: price.active,
          intervalCount: price.intervalCount!,
          intervalUnit: price.intervalUnit!,
          usageMeterSlug,
          usageEventsPerUnit: price.usageEventsPerUnit!,
          trialPeriodDays: null,
        },
        features: [] as string[],
      }
    })

  return validateSetupPricingModelInput({
    name: pricingModel.name,
    isDefault: pricingModel.isDefault,
    features: transformedFeatures,
    products: [
      ...transformedProducts,
      ...virtualProductsForUsagePrices,
    ],
    usageMeters: transformedUsageMeters,
  })
}
