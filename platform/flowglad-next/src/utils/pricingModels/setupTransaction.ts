import { createDefaultPlanConfig } from '@/constants/defaultPlanConfig'
import type { Feature } from '@/db/schema/features'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import type { Resource } from '@/db/schema/resources'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug } from '@/db/tableMethods/featureMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { bulkInsertPrices } from '@/db/tableMethods/priceMethods'
import { safelyInsertPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId } from '@/db/tableMethods/productFeatureMethods'
import { bulkInsertProducts } from '@/db/tableMethods/productMethods'
import { bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug } from '@/db/tableMethods/resourceMethods'
import { bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId } from '@/db/tableMethods/usageMeterMethods'
import type { DbTransaction } from '@/db/types'
import { FeatureType, IntervalUnit, PriceType } from '@/types'
import { hashData } from '@/utils/backendCore'
import { validateDefaultProductSchema } from '@/utils/defaultProductValidation'
import { createProductPriceInsert } from '@/utils/pricingModels/setupHelpers'
import {
  type SetupPricingModelInput,
  type SetupPricingModelProductInput,
  validateSetupPricingModelInput,
} from '@/utils/pricingModels/setupSchemas'

export const externalIdFromProductData = (
  product: SetupPricingModelProductInput,
  pricingModelId: string
) => {
  return hashData(JSON.stringify({ ...product, pricingModelId }))
}

export const setupPricingModelTransaction = async (
  {
    input: rawInput,
    organizationId,
    livemode,
  }: {
    input: SetupPricingModelInput
    organizationId: string
    livemode: boolean
  },
  transaction: DbTransaction
) => {
  const input = validateSetupPricingModelInput(rawInput)

  // Check for multiple default products
  const defaultProducts = input.products.filter(
    (p) => p.product.default
  )
  if (defaultProducts.length > 1) {
    throw new Error('Multiple default products not allowed')
  }

  // Validate single default product if provided
  if (defaultProducts.length === 1) {
    const defaultProduct = defaultProducts[0]
    validateDefaultProductSchema({
      name: defaultProduct.product.name,
      slug: defaultProduct.product.slug || undefined,
      price: {
        amount: defaultProduct.price.unitPrice,
        type: defaultProduct.price.type,
        slug: defaultProduct.price.slug || undefined,
        trialDays: defaultProduct.price.trialPeriodDays || undefined,
      },
    })
  }

  const pricingModelInsert: PricingModel.Insert = {
    name: input.name,
    livemode,
    organizationId,
    isDefault: input.isDefault,
  }
  const organization = await selectOrganizationById(
    organizationId,
    transaction
  )
  const pricingModel = await safelyInsertPricingModel(
    pricingModelInsert,
    transaction
  )
  const usageMeterInserts: UsageMeter.Insert[] =
    input.usageMeters.map((meterWithPrices) => ({
      slug: meterWithPrices.usageMeter.slug,
      name: meterWithPrices.usageMeter.name,
      livemode,
      organizationId,
      pricingModelId: pricingModel.id,
      ...(meterWithPrices.usageMeter.aggregationType && {
        aggregationType: meterWithPrices.usageMeter.aggregationType,
      }),
    }))
  const usageMeters =
    await bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId(
      usageMeterInserts,
      transaction
    )
  const usageMetersBySlug = new Map(
    usageMeters.map((usageMeter) => [usageMeter.slug, usageMeter])
  )

  // Create resources before features (Resource features need to resolve resourceSlug → resourceId)
  const resourceInserts: Resource.Insert[] = (
    input.resources ?? []
  ).map((resource) => ({
    slug: resource.slug,
    name: resource.name,
    pricingModelId: pricingModel.id,
    organizationId,
    livemode,
    active: resource.active ?? true,
  }))
  const resources =
    await bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug(
      resourceInserts,
      transaction
    )
  const resourcesBySlug = new Map(
    resources.map((resource) => [resource.slug, resource])
  )

  const featureInserts: Feature.Insert[] = input.features.map(
    (feature) => {
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
        pricingModelId: pricingModel.id,
        livemode,
        organizationId,
      }
      if (feature.type === FeatureType.UsageCreditGrant) {
        const usageMeter = usageMetersBySlug.get(
          feature.usageMeterSlug
        )
        if (!usageMeter) {
          throw new Error(
            `Usage meter ${feature.usageMeterSlug} not found`
          )
        }
        return {
          ...coreParams,
          type: FeatureType.UsageCreditGrant,
          usageMeterId: usageMeter.id,
          resourceId: null,
          amount: feature.amount,
          renewalFrequency: feature.renewalFrequency,
          active: feature.active ?? true,
        }
      }

      if (feature.type === FeatureType.Resource) {
        const resource = resourcesBySlug.get(feature.resourceSlug)
        if (!resource) {
          throw new Error(
            `Resource with slug ${feature.resourceSlug} does not exist`
          )
        }
        return {
          ...coreParams,
          type: FeatureType.Resource,
          resourceId: resource.id,
          usageMeterId: null,
          amount: feature.amount,
          renewalFrequency: null,
          active: feature.active ?? true,
        }
      }

      // Toggle type (default)
      return {
        ...coreParams,
        type: FeatureType.Toggle,
        usageMeterId: null,
        resourceId: null,
        amount: null,
        renewalFrequency: null,
        // using provided feature.active here rather than always defaulting to true,
        // since currently a feature marked as inactive in yaml will import and
        // get set up as an active feature, which is not good behavior.
        // with the new changes in setupHelpers.ts, we shouldn't get this situation anymore
        active: feature.active ?? true,
      }
    }
  )
  const features =
    await bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug(
      featureInserts,
      transaction
    )
  const productInserts: Product.Insert[] = input.products.map(
    (product) => {
      return {
        ...product.product,
        pricingModelId: pricingModel.id,
        livemode,
        organizationId,
        externalId: externalIdFromProductData(
          product,
          pricingModel.id
        ),
      }
    }
  )
  const products = await bulkInsertProducts(
    productInserts,
    transaction
  )
  const productsByExternalId = new Map(
    products.map((product) => [product.externalId, product])
  )

  // Build product price inserts (subscription and single payment only)
  const productPriceInserts: Price.Insert[] = input.products.map(
    (product) => {
      const productId = productsByExternalId.get(
        externalIdFromProductData(product, pricingModel.id)
      )?.id
      if (!productId) {
        throw new Error(`Product ${product.product.name} not found`)
      }
      return createProductPriceInsert(product.price, {
        productId,
        currency: organization.defaultCurrency,
        livemode,
      })
    }
  )

  // Build usage price inserts from usageMeters[].prices
  // Usage prices belong directly to usage meters, not products
  const usagePriceInserts: Price.Insert[] = input.usageMeters.flatMap(
    (meterWithPrices) => {
      const usageMeter = usageMetersBySlug.get(
        meterWithPrices.usageMeter.slug
      )
      if (!usageMeter) {
        throw new Error(
          `Usage meter ${meterWithPrices.usageMeter.slug} not found`
        )
      }

      return (meterWithPrices.prices || []).map((price) => ({
        type: PriceType.Usage as const,
        name: price.name ?? null,
        slug: price.slug ?? null,
        unitPrice: price.unitPrice,
        isDefault: price.isDefault,
        active: price.active,
        intervalCount: price.intervalCount,
        intervalUnit: price.intervalUnit,
        trialPeriodDays: null, // Usage prices don't have trial periods
        usageEventsPerUnit: price.usageEventsPerUnit,
        currency: organization.defaultCurrency,
        productId: null, // Usage prices don't have productId
        pricingModelId: pricingModel.id, // Explicit for usage prices
        livemode,
        externalId: null,
        usageMeterId: usageMeter.id,
      }))
    }
  )

  // Combine product prices and usage prices
  const priceInserts: Price.Insert[] = [
    ...productPriceInserts,
    ...usagePriceInserts,
  ]

  // Auto-generate default plan if none provided
  if (defaultProducts.length === 0) {
    const defaultPlanConfig = createDefaultPlanConfig()

    // Create the default product
    const defaultProductInsert: Product.Insert = {
      ...defaultPlanConfig.product,
      pricingModelId: pricingModel.id,
      organizationId,
      livemode,
      externalId: hashData(
        JSON.stringify({
          name: 'Free Plan',
          pricingModelId: pricingModel.id,
        })
      ),
      description: null,
      imageURL: null,
      active: true,
      singularQuantityLabel: null,
      pluralQuantityLabel: null,
    }

    const defaultProductsResult = await bulkInsertProducts(
      [defaultProductInsert],
      transaction
    )
    const defaultProduct = defaultProductsResult[0]

    // Add the default product to our products array
    products.push(defaultProduct)
    productsByExternalId.set(
      defaultProduct.externalId,
      defaultProduct
    )

    // Create the default price.
    // Type assertion needed because defaultPlanConfig.price.type is not
    // narrowed to a specific PriceType, but default products always use subscription prices.
    const defaultPriceInsert: Price.SubscriptionInsert = {
      type: PriceType.Subscription,
      name: defaultPlanConfig.price.name,
      slug: defaultPlanConfig.price.slug,
      unitPrice: defaultPlanConfig.price.unitPrice,
      isDefault: defaultPlanConfig.price.isDefault,
      active: true,
      intervalCount: defaultPlanConfig.price.intervalCount,
      intervalUnit: defaultPlanConfig.price.intervalUnit,
      trialPeriodDays: null,
      usageEventsPerUnit: null,
      currency: organization.defaultCurrency,
      productId: defaultProduct.id,
      livemode,
      externalId: null,
      usageMeterId: null,
    }

    // Add default price to priceInserts
    priceInserts.push(defaultPriceInsert)
  }

  const prices = await bulkInsertPrices(priceInserts, transaction)
  const featuresBySlug = new Map(
    features.map((feature) => [feature.slug, feature])
  )

  const productFeatureInserts: ProductFeature.Insert[] =
    input.products.flatMap((product) => {
      return product.features.map((featureSlug) => {
        const feature = featuresBySlug.get(featureSlug)
        if (!feature) {
          throw new Error(`Feature ${featureSlug} not found`)
        }
        const productId = productsByExternalId.get(
          externalIdFromProductData(product, pricingModel.id)
        )?.id
        if (!productId) {
          throw new Error(`Product ${product.product.name} not found`)
        }
        return {
          organizationId,
          productId,
          featureId: feature.id,
          livemode,
          externalId: null,
        }
      })
    })

  const productFeatures =
    await bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId(
      productFeatureInserts,
      transaction
    )

  return {
    pricingModel,
    products,
    prices,
    features,
    productFeatures,
    usageMeters,
    resources,
  }
}
