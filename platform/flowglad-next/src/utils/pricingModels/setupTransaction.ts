import { CurrencyCode, FeatureType, PriceType } from '@db-core/enums'
import type { Feature } from '@db-core/schema/features'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { ProductFeature } from '@db-core/schema/productFeatures'
import type { Product } from '@db-core/schema/products'
import type { Resource } from '@db-core/schema/resources'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import { Result } from 'better-result'
import { createDefaultPlanConfig } from '@/constants/defaultPlanConfig'
import { bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug } from '@/db/tableMethods/featureMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { bulkInsertPrices } from '@/db/tableMethods/priceMethods'
import { safelyInsertPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId } from '@/db/tableMethods/productFeatureMethods'
import { bulkInsertProducts } from '@/db/tableMethods/productMethods'
import { bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug } from '@/db/tableMethods/resourceMethods'
import { bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId } from '@/db/tableMethods/usageMeterMethods'
import type { TransactionEffectsContext } from '@/db/types'
import { NotFoundError, ValidationError } from '@/errors'
import { hashData } from '@/utils/backendCore'
import { validateDefaultProductSchema } from '@/utils/defaultProductValidation'
import { createProductPriceInsert } from '@/utils/pricingModels/setupHelpers'
import {
  type SetupPricingModelInput,
  type SetupPricingModelProductInput,
  validateSetupPricingModelInput,
} from '@/utils/pricingModels/setupSchemas'
import { createNoChargePriceInsert } from '@/utils/usage/noChargePriceHelpers'

export interface SetupPricingModelResult {
  pricingModel: PricingModel.Record
  products: Product.Record[]
  prices: Price.Record[]
  features: Feature.Record[]
  productFeatures: ProductFeature.Record[]
  usageMeters: UsageMeter.Record[]
  resources: Resource.Record[]
}

export const externalIdFromProductData = (
  product: SetupPricingModelProductInput,
  pricingModelId: string
) => {
  return hashData(JSON.stringify({ ...product, pricingModelId }))
}

/**
 * Builds feature inserts from validated input, resolving usageMeterSlug and resourceSlug
 * to their respective IDs.
 */
const buildFeatureInserts = (
  features: SetupPricingModelInput['features'],
  context: {
    pricingModelId: string
    organizationId: string
    livemode: boolean
    usageMetersBySlug: Map<string, UsageMeter.Record>
    resourcesBySlug: Map<string, Resource.Record>
  }
): Result<Feature.Insert[], NotFoundError> => {
  return Result.gen(function* () {
    const {
      pricingModelId,
      organizationId,
      livemode,
      usageMetersBySlug,
      resourcesBySlug,
    } = context
    const featureInserts: Feature.Insert[] = []

    for (const feature of features) {
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
        livemode,
        organizationId,
      }

      if (feature.type === FeatureType.UsageCreditGrant) {
        const usageMeter = usageMetersBySlug.get(
          feature.usageMeterSlug
        )
        if (!usageMeter) {
          return yield* Result.err(
            new NotFoundError('UsageMeter', feature.usageMeterSlug)
          )
        }
        featureInserts.push({
          ...coreParams,
          type: FeatureType.UsageCreditGrant,
          usageMeterId: usageMeter.id,
          resourceId: null,
          amount: feature.amount,
          renewalFrequency: feature.renewalFrequency,
          active: feature.active ?? true,
        })
        continue
      }

      if (feature.type === FeatureType.Resource) {
        const resource = resourcesBySlug.get(feature.resourceSlug)
        if (!resource) {
          return yield* Result.err(
            new NotFoundError('Resource', feature.resourceSlug)
          )
        }
        featureInserts.push({
          ...coreParams,
          type: FeatureType.Resource,
          resourceId: resource.id,
          usageMeterId: null,
          amount: feature.amount,
          renewalFrequency: null,
          active: feature.active ?? true,
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

    return Result.ok(featureInserts)
  })
}

/**
 * Builds usage price inserts from usageMeters[].prices, resolving usageMeterSlug to usageMeterId.
 */
const buildUsagePriceInserts = (
  usageMetersInput: SetupPricingModelInput['usageMeters'],
  context: {
    pricingModelId: string
    livemode: boolean
    currency: CurrencyCode
    usageMetersBySlug: Map<string, UsageMeter.Record>
  }
): Result<Price.Insert[], NotFoundError> => {
  return Result.gen(function* () {
    const { pricingModelId, livemode, currency, usageMetersBySlug } =
      context
    const usagePriceInserts: Price.Insert[] = []

    for (const meterWithPrices of usageMetersInput) {
      const usageMeter = usageMetersBySlug.get(
        meterWithPrices.usageMeter.slug
      )
      if (!usageMeter) {
        return yield* Result.err(
          new NotFoundError(
            'UsageMeter',
            meterWithPrices.usageMeter.slug
          )
        )
      }

      for (const price of meterWithPrices.prices || []) {
        usagePriceInserts.push({
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
          currency,
          productId: null, // Usage prices don't have productId
          pricingModelId, // Explicit for usage prices
          livemode,
          externalId: null,
          usageMeterId: usageMeter.id,
        })
      }
    }

    return Result.ok(usagePriceInserts)
  })
}

/**
 * Builds product price inserts from products[].price, resolving product names to productIds.
 */
const buildProductPriceInserts = (
  productsInput: SetupPricingModelInput['products'],
  context: {
    pricingModelId: string
    livemode: boolean
    currency: CurrencyCode
    productsByExternalId: Map<string | null, Product.Record>
  }
): Result<Price.Insert[], NotFoundError> => {
  return Result.gen(function* () {
    const {
      pricingModelId,
      livemode,
      currency,
      productsByExternalId,
    } = context
    const productPriceInserts: Price.Insert[] = []

    for (const product of productsInput) {
      const productRecord = productsByExternalId.get(
        externalIdFromProductData(product, pricingModelId)
      )
      if (!productRecord) {
        return yield* Result.err(
          new NotFoundError('Product', product.product.name)
        )
      }
      productPriceInserts.push(
        createProductPriceInsert(product.price, {
          productId: productRecord.id,
          currency,
          livemode,
        })
      )
    }

    return Result.ok(productPriceInserts)
  })
}

/**
 * Builds product feature inserts, resolving feature slugs and product names to their IDs.
 */
const buildProductFeatureInserts = (
  productsInput: SetupPricingModelInput['products'],
  context: {
    pricingModelId: string
    organizationId: string
    livemode: boolean
    featuresBySlug: Map<string, Feature.Record>
    productsByExternalId: Map<string | null, Product.Record>
  }
): Result<ProductFeature.Insert[], NotFoundError> => {
  return Result.gen(function* () {
    const {
      pricingModelId,
      organizationId,
      livemode,
      featuresBySlug,
      productsByExternalId,
    } = context
    const productFeatureInserts: ProductFeature.Insert[] = []

    for (const product of productsInput) {
      for (const featureSlug of product.features) {
        const feature = featuresBySlug.get(featureSlug)
        if (!feature) {
          return yield* Result.err(
            new NotFoundError('Feature', featureSlug)
          )
        }
        const productRecord = productsByExternalId.get(
          externalIdFromProductData(product, pricingModelId)
        )
        if (!productRecord) {
          return yield* Result.err(
            new NotFoundError('Product', product.product.name)
          )
        }
        productFeatureInserts.push({
          organizationId,
          productId: productRecord.id,
          featureId: feature.id,
          livemode,
        })
      }
    }

    return Result.ok(productFeatureInserts)
  })
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
  ctx: TransactionEffectsContext
): Promise<
  Result<SetupPricingModelResult, ValidationError | NotFoundError>
> => {
  return Result.gen(async function* () {
    const { transaction } = ctx
    const input = yield* validateSetupPricingModelInput(rawInput)

    // Check for multiple default products
    const defaultProducts = input.products.filter(
      (p) => p.product.default
    )
    if (defaultProducts.length > 1) {
      return yield* Result.err(
        new ValidationError(
          'products',
          'Multiple default products not allowed'
        )
      )
    }

    // Validate single default product if provided
    if (defaultProducts.length === 1) {
      const defaultProduct = defaultProducts[0]
      yield* validateDefaultProductSchema({
        name: defaultProduct.product.name,
        slug: defaultProduct.product.slug || undefined,
        price: {
          amount: defaultProduct.price.unitPrice,
          type: defaultProduct.price.type,
          slug: defaultProduct.price.slug || undefined,
          trialDays:
            defaultProduct.price.trialPeriodDays || undefined,
        },
      })
    }

    const pricingModelInsert: PricingModel.Insert = {
      name: input.name,
      livemode,
      organizationId,
      isDefault: input.isDefault,
    }
    const organization = (
      await selectOrganizationById(organizationId, transaction)
    ).unwrap()
    const pricingModel = await safelyInsertPricingModel(
      pricingModelInsert,
      ctx
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
        ctx
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

    // Build feature inserts using helper
    const featureInserts = yield* buildFeatureInserts(
      input.features,
      {
        pricingModelId: pricingModel.id,
        organizationId,
        livemode,
        usageMetersBySlug,
        resourcesBySlug,
      }
    )
    const features =
      await bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug(
        featureInserts,
        ctx
      )

    // Build product inserts
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
    const products = await bulkInsertProducts(productInserts, ctx)
    const productsByExternalId = new Map(
      products.map((product) => [product.externalId, product])
    )

    // Build product price inserts using helper
    const productPriceInserts = yield* buildProductPriceInserts(
      input.products,
      {
        pricingModelId: pricingModel.id,
        livemode,
        currency: organization.defaultCurrency,
        productsByExternalId,
      }
    )

    // Build usage price inserts using helper
    const usagePriceInserts = yield* buildUsagePriceInserts(
      input.usageMeters,
      {
        pricingModelId: pricingModel.id,
        livemode,
        currency: organization.defaultCurrency,
        usageMetersBySlug,
      }
    )

    // Determine which usage meters have a user-specified ACTIVE default price
    // Now that validation no longer mutates isDefault (Patch 3), we can use validated input directly
    // No-charge prices should only be the default if no user price is set as default
    // Note: validation now rejects isDefault=true with active=false, but we also check active here
    // for defense in depth
    const metersWithUserDefaultPrice = new Set(
      input.usageMeters
        .filter((meterWithPrices) =>
          (meterWithPrices.prices || []).some(
            (price) => price.isDefault && price.active !== false
          )
        )
        .map((meterWithPrices) => meterWithPrices.usageMeter.slug)
    )

    // Create no-charge prices for ALL usage meters
    // These serve as fallback prices when no other price is configured
    const noChargePriceInserts: Price.Insert[] = usageMeters.map(
      (usageMeter) => {
        const hasUserDefaultPrice = metersWithUserDefaultPrice.has(
          usageMeter.slug
        )
        const noChargePrice = createNoChargePriceInsert(usageMeter, {
          currency: organization.defaultCurrency,
        })
        return {
          ...noChargePrice,
          // Only set as default if no user price is default
          isDefault: !hasUserDefaultPrice,
        }
      }
    )

    // Combine product prices, user-specified usage prices, and auto-generated no-charge prices
    const priceInserts: Price.Insert[] = [
      ...productPriceInserts,
      ...usagePriceInserts,
      ...noChargePriceInserts,
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
        ctx
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

    const prices = await bulkInsertPrices(priceInserts, ctx)
    const featuresBySlug = new Map(
      features.map((feature) => [feature.slug, feature])
    )

    // Build product feature inserts using helper
    const productFeatureInserts = yield* buildProductFeatureInserts(
      input.products,
      {
        pricingModelId: pricingModel.id,
        organizationId,
        livemode,
        featuresBySlug,
        productsByExternalId,
      }
    )

    const productFeatures =
      await bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId(
        productFeatureInserts,
        ctx
      )

    return Result.ok({
      pricingModel,
      products,
      prices,
      features,
      productFeatures,
      usageMeters,
      resources,
    })
  })
}
