import { bulkInsertProducts } from '@/db/tableMethods/productMethods'
import { bulkInsertPrices } from '@/db/tableMethods/priceMethods'
import { DbTransaction } from '@/db/types'
import { Price } from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { safelyInsertPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { PricingModel } from '@/db/schema/pricingModels'
import { bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId } from '@/db/tableMethods/productFeatureMethods'
import {
  SetupPricingModelInput,
  SetupPricingModelProductInput,
  validateSetupPricingModelInput,
} from '@/utils/pricingModels/setupSchemas'
import { Feature } from '@/db/schema/features'
import { bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId } from '@/db/tableMethods/usageMeterMethods'
import { FeatureType, PriceType } from '@/types'
import { bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug } from '@/db/tableMethods/featureMethods'
import { hashData } from '@/utils/backendCore'
import { UsageMeter } from '@/db/schema/usageMeters'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { ProductFeature } from '@/db/schema/productFeatures'
import { validateDefaultProductSchema } from '@/utils/defaultProductValidation'
import { IntervalUnit } from '@/types'
import { createDefaultPlanConfig } from '@/constants/defaultPlanConfig'

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
  const defaultProducts = input.products.filter(p => p.product.default)
  if (defaultProducts.length > 1) {
    throw new Error("Multiple default products not allowed")
  }
  
  // Validate single default product if provided
  if (defaultProducts.length === 1) {
    const defaultProduct = defaultProducts[0]
    validateDefaultProductSchema({
      name: defaultProduct.product.name,
      slug: defaultProduct.product.slug || undefined,
      prices: defaultProduct.prices.map(p => ({
        amount: p.unitPrice,
        type: p.type,
        slug: p.slug || undefined,
        trialDays: p.trialPeriodDays || undefined,
        setupFee: p.setupFeeAmount || undefined
      }))
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
    input.usageMeters.map((usageMeter) => ({
      slug: usageMeter.slug,
      name: usageMeter.name,
      livemode,
      organizationId,
      pricingModelId: pricingModel.id,
    }))
  const usageMeters =
    await bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId(
      usageMeterInserts,
      transaction
    )
  const usageMetersBySlug = new Map(
    usageMeters.map((usageMeter) => [usageMeter.slug, usageMeter])
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
          amount: feature.amount,
          renewalFrequency: feature.renewalFrequency,
        }
      }
      return {
        ...coreParams,
        type: FeatureType.Toggle,
        usageMeterId: null,
        amount: null,
        renewalFrequency: null,
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

  const priceInserts: Price.Insert[] = input.products.flatMap(
    (product) => {
      const productId = productsByExternalId.get(
        externalIdFromProductData(product, pricingModel.id)
      )?.id
      if (!productId) {
        throw new Error(`Product ${product.product.name} not found`)
      }
      return product.prices.map((price) => {
        switch (price.type) {
          case PriceType.Usage: {
            const usageMeterId = usageMetersBySlug.get(
              price.usageMeterSlug
            )?.id
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
              setupFeeAmount: price.setupFeeAmount,
              usageEventsPerUnit: price.usageEventsPerUnit,
              overagePriceId: price.overagePriceId,
              startsWithCreditTrial: price.startsWithCreditTrial,
              currency: organization.defaultCurrency,
              productId,
              livemode,
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
              setupFeeAmount: price.setupFeeAmount,
              usageEventsPerUnit: price.usageEventsPerUnit,
              overagePriceId: price.overagePriceId,
              startsWithCreditTrial: price.startsWithCreditTrial,
              currency: organization.defaultCurrency,
              productId,
              livemode,
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
              trialPeriodDays: price.trialPeriodDays,
              setupFeeAmount: price.setupFeeAmount,
              usageEventsPerUnit: price.usageEventsPerUnit,
              overagePriceId: null,
              startsWithCreditTrial: null,
              currency: organization.defaultCurrency,
              productId,
              livemode,
              externalId: null,
              usageMeterId: null,
            }

            default:
              throw new Error(`Unknown or unhandled price type on price: ${price}`)
        }
      })
    }
  )

  // Auto-generate default plan if none provided
  if (defaultProducts.length === 0) {
    const defaultPlanConfig = createDefaultPlanConfig()
    
    // Create the default product
    const defaultProductInsert: Product.Insert = {
      ...defaultPlanConfig.product,
      pricingModelId: pricingModel.id,
      organizationId,
      livemode,
      externalId: hashData(JSON.stringify({ name: 'Free Plan', pricingModelId: pricingModel.id })),
      displayFeatures: null,
      description: null,
      imageURL: null,
      active: true,
      singularQuantityLabel: null,
      pluralQuantityLabel: null
    }
    
    const defaultProductsResult = await bulkInsertProducts([defaultProductInsert], transaction)
    const defaultProduct = defaultProductsResult[0]
    
    // Add the default product to our products array
    products.push(defaultProduct)
    productsByExternalId.set(defaultProduct.externalId, defaultProduct)
    
    // Create the default price
    const defaultPriceInsert: Price.Insert = {
      type: defaultPlanConfig.price.type,
      name: defaultPlanConfig.price.name,
      slug: defaultPlanConfig.price.slug,
      unitPrice: defaultPlanConfig.price.unitPrice,
      isDefault: defaultPlanConfig.price.isDefault,
      active: true,
      intervalCount: defaultPlanConfig.price.intervalCount,
      intervalUnit: defaultPlanConfig.price.intervalUnit,
      trialPeriodDays: null,
      setupFeeAmount: null,
      usageEventsPerUnit: null,
      overagePriceId: null,
      startsWithCreditTrial: null,
      currency: organization.defaultCurrency,
      productId: defaultProduct.id,
      livemode,
      externalId: null,
      usageMeterId: null
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
  }
}
