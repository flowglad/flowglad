import { DbTransaction } from '@/db/types'
import { SetupPricingModelInput } from './setupSchemas'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import { selectFeatures } from '@/db/tableMethods/featureMethods'
import { selectPricesAndProductsByProductWhere } from '@/db/tableMethods/priceMethods'
import { selectFeaturesByProductFeatureWhere } from '@/db/tableMethods/productFeatureMethods'
import { FeatureType, PriceType } from '@/types'

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
    { pricingModelId: pricingModel.id },
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

  // Check each prpduct has a non-null and non-empty slug
  for (const product of productsWithPrices) {
    if (!product.slug) {
      throw new Error(
        `Product ${product.name} (ID: ${product.id}) has no slug`
      )
    }
  }

  // Fetch all product-feature relationships
  const productIds = productsWithPrices.map((p) => p.id)
  const productFeaturesWithFeatures =
    productIds.length > 0
      ? await selectFeaturesByProductFeatureWhere(
          { productId: productIds },
          transaction
        )
      : []

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
      const transformedPrices = prices.map((price) => {
        // Base price fields common to all price types
        const basePrice = {
          name: price.name ?? undefined,
          slug: price.slug ?? undefined,
          unitPrice: price.unitPrice,
          isDefault: price.isDefault,
          active: price.active,
        }

        if (price.type === PriceType.Usage) {
          if (!price.usageMeterId) {
            throw new Error(
              `Price ${price.id} is a Usage price but has no usageMeterId`
            )
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
            ...basePrice,
            type: PriceType.Usage as const,
            usageMeterSlug,
            intervalCount: price.intervalCount!,
            intervalUnit: price.intervalUnit!,
            usageEventsPerUnit: price.usageEventsPerUnit!,
            trialPeriodDays: null,
          }
        } else if (price.type === PriceType.Subscription) {
          return {
            ...basePrice,
            type: PriceType.Subscription as const,
            intervalCount: price.intervalCount!,
            intervalUnit: price.intervalUnit!,
            trialPeriodDays: price.trialPeriodDays ?? undefined,
            usageMeterId: null,
            usageEventsPerUnit: null,
          }
        } else if (price.type === PriceType.SinglePayment) {
          return {
            ...basePrice,
            type: PriceType.SinglePayment as const,
            trialPeriodDays: price.trialPeriodDays ?? undefined,
          }
        } else {
          throw new Error(
            `Unknown price type: ${(price as any).type}`
          )
        }
      })

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
        prices: transformedPrices,
        features: featureSlugsByProductId.get(product.id) || [],
      }
    }
  )

  return {
    name: pricingModel.name,
    isDefault: pricingModel.isDefault,
    features: transformedFeatures,
    products: transformedProducts,
    usageMeters: transformedUsageMeters,
  }
}
