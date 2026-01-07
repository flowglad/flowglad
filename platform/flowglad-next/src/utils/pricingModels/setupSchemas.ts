import * as R from 'ramda'
import { z } from 'zod'
import { currencyCodeSchema } from '@/db/commonZodSchema'
import {
  toggleFeatureClientInsertSchema,
  usageCreditGrantFeatureClientInsertSchema,
} from '@/db/schema/features'
import {
  singlePaymentPriceClientInsertSchema,
  subscriptionPriceClientInsertSchema,
  usagePriceClientInsertSchema,
} from '@/db/schema/prices'
import { pricingModelsClientInsertSchema } from '@/db/schema/pricingModels'
import { productsClientInsertSchema } from '@/db/schema/products'
import { usageMetersClientInsertSchema } from '@/db/schema/usageMeters'
import { FeatureType, PriceType } from '@/types'
import core, { safeZodSanitizedString } from '../core'

/**
 * FIXME: we should be using safeZodSanitizedString for
 * all slug fields at the DB schemas level.
 *
 * The problem is that there are several records with slugs in the DB
 * that would not parse if they were held to this schema.
 * - prices
 * - products
 * (note: usage meters and features are already using safeZodSanitizedString)
 */

export const featurePricingModelSetupSchema = z
  .discriminatedUnion('type', [
    toggleFeatureClientInsertSchema
      .omit({
        pricingModelId: true,
        usageMeterId: true,
        amount: true,
        renewalFrequency: true,
      })
      .describe(
        'A feature that can be granted in a true / false boolean state. When granted to a customer, it will return true.'
      ),
    usageCreditGrantFeatureClientInsertSchema
      .omit({
        pricingModelId: true,
        usageMeterId: true,
      })
      .extend({
        usageMeterSlug: z
          .string()
          .describe(
            'The slug of the usage meter to grant credit for. Must be a valid slug for a usage meter.'
          ),
      })
      .describe('A credit grant to give for a usage meter.'),
  ])
  .describe(
    'A feature that can be granted to a customer. Will be associated with products.'
  )

const productPricingModelSetupSchema = productsClientInsertSchema
  .omit({
    pricingModelId: true,
  })
  .extend({
    name: safeZodSanitizedString.describe('The name of the product'),
    slug: safeZodSanitizedString.describe('The slug of the product'),
  })
  .describe(
    'A product, which describes "what" a customer gets when they purchase via features, and how much they pay via prices.'
  )

const omitProductId = {
  productId: true,
} as const

const priceOptionalFieldSchema = {
  currency: currencyCodeSchema.optional(),
  name: safeZodSanitizedString.optional(),
  slug: safeZodSanitizedString.optional(),
} as const

/**
 * Schema for product prices (subscription and single payment).
 * Usage prices are NOT included here - they belong to usage meters.
 */
export const setupPricingModelProductPriceInputSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceClientInsertSchema.omit(omitProductId).extend({
      ...priceOptionalFieldSchema,
    }),
    singlePaymentPriceClientInsertSchema.omit(omitProductId).extend({
      ...priceOptionalFieldSchema,
    }),
  ])
  .refine(
    (price) => price.active === true && price.isDefault === true,
    {
      message: 'Price must have active=true and isDefault=true',
    }
  )

export type SetupPricingModelProductPriceInput = z.infer<
  typeof setupPricingModelProductPriceInputSchema
>

/**
 * Schema for usage prices that belong to usage meters.
 * Usage prices do NOT have productId - they belong to usage meters directly.
 */
export const setupUsageMeterPriceInputSchema =
  usagePriceClientInsertSchema
    .omit({
      productId: true,
      usageMeterId: true,
    })
    .extend({
      ...priceOptionalFieldSchema,
    })

export type SetupUsageMeterPriceInput = z.infer<
  typeof setupUsageMeterPriceInputSchema
>

/**
 * Schema for a usage meter with its prices.
 * Usage prices belong directly to usage meters, not products.
 */
export const setupUsageMeterWithPricesInputSchema = z.object({
  usageMeter: usageMetersClientInsertSchema
    .omit({
      pricingModelId: true,
    })
    .describe(
      'The usage meter configuration. Each dimension along which usage will be tracked needs its own meter.'
    ),
  prices: z
    .array(setupUsageMeterPriceInputSchema)
    .optional()
    .describe(
      'The prices for this usage meter. Each price defines how usage on this meter is billed.'
    ),
})

export type SetupUsageMeterWithPricesInput = z.infer<
  typeof setupUsageMeterWithPricesInputSchema
>

const setupPricingModelProductInputSchema = z.object({
  product: productPricingModelSetupSchema.describe(
    'The product to add to the pricingModel. Must be a subset of the products in the pricingModel.'
  ),
  price: setupPricingModelProductPriceInputSchema.describe(
    'The price for the product. Must have active=true and isDefault=true.'
  ),
  features: z
    .array(z.string())
    .describe(
      'The slugs of the features that will granted when they purchase the product. Must be a subset of the slugs of the features in the pricingModel.'
    ),
})

export type SetupPricingModelProductInput = z.infer<
  typeof setupPricingModelProductInputSchema
>

const slugsAreUnique = (sluggableResources: { slug: string }[]) => {
  const slugs = sluggableResources.map((r) => r.slug)
  return slugs.length === new Set(slugs).size
}

export const setupPricingModelSchema =
  pricingModelsClientInsertSchema.extend({
    name: safeZodSanitizedString.describe(
      'The name of the pricing model'
    ),
    isDefault: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether the pricingModel to be created will be the default pricingModel for all customers moving forward.'
      ),
    features: z
      .array(featurePricingModelSetupSchema)
      .refine(slugsAreUnique, {
        message: 'Features must have unique slugs',
      }),
    products: z
      .array(setupPricingModelProductInputSchema)
      .refine(
        (products) => slugsAreUnique(products.map((p) => p.product)),
        {
          message: 'Products must have unique slugs',
        }
      ),
    /**
     * Usage meters with their prices.
     * Usage prices belong directly to usage meters, not products.
     * This replaces the old pattern of putting usage prices under products.
     */
    usageMeters: z
      .array(setupUsageMeterWithPricesInputSchema)
      .refine(
        (meters) => slugsAreUnique(meters.map((m) => m.usageMeter)),
        {
          message: 'Usage meters must have unique slugs',
        }
      ),
  })

export type SetupPricingModelInput = z.infer<
  typeof setupPricingModelSchema
>

export const validateSetupPricingModelInput = (
  input: SetupPricingModelInput
) => {
  const result = setupPricingModelSchema.safeParse(input)
  if (!result.success) {
    if (
      process.env.NODE_ENV === 'test' &&
      result.error instanceof z.ZodError
    ) {
      for (const issue of result.error.issues) {
        const { path, message } = issue
        // Try to extract the problematic value and its type from the input
        let value: unknown
        let valueType: string = 'unknown'
        // The input to safeParse is `input`
        let current: any = input
        for (const key of path) {
          if (
            current &&
            typeof current === 'object' &&
            key in current
          ) {
            current = current[key]
          } else {
            current = undefined
            break
          }
        }
        if (current !== undefined) {
          value = current
          valueType = Object.prototype.toString.call(current)
        }
        // Print debug info
        // eslint-disable-next-line no-console
        console.info(
          '[validateSetupPricingModelInput][TEST] ZodError at path:',
          path.join('.'),
          '| value:',
          value,
          '| type:',
          valueType,
          '| message:',
          message
        )
      }
    }
    throw result.error
  }

  const parsed = result.data

  const featuresBySlug = core.groupBy(R.prop('slug'), parsed.features)
  const usageMetersBySlug = core.groupBy(
    (m) => m.usageMeter.slug,
    parsed.usageMeters
  )

  // Collect all price slugs for uniqueness validation
  const allPriceSlugs = new Set<string>()

  // Validate product prices
  parsed.products.forEach((product) => {
    // Validate features
    product.features.forEach((featureSlug) => {
      const featureArr = featuresBySlug[featureSlug] || []
      const feature = featureArr[0]
      if (!feature) {
        throw new Error(
          `Feature with slug ${featureSlug} does not exist`
        )
      }
      if (feature.type === FeatureType.UsageCreditGrant) {
        if (!usageMetersBySlug[feature.usageMeterSlug]) {
          throw new Error(
            `Usage meter with slug ${feature.usageMeterSlug} does not exist`
          )
        }
      }
    })

    // Validate product price (subscription or single payment)
    const price = product.price
    if (!price.slug) {
      throw new Error(
        `Price slug is required. Received ${JSON.stringify(price)}`
      )
    }
    if (allPriceSlugs.has(price.slug)) {
      throw new Error(`Price with slug ${price.slug} already exists`)
    }
    allPriceSlugs.add(price.slug)
  })

  // Validate usage meter prices and implement implicit default logic
  parsed.usageMeters.forEach((meterWithPrices) => {
    const prices = meterWithPrices.prices || []

    // Validate each price in the meter
    prices.forEach((price) => {
      if (price.slug) {
        if (allPriceSlugs.has(price.slug)) {
          throw new Error(
            `Price with slug ${price.slug} already exists`
          )
        }
        allPriceSlugs.add(price.slug)
      }
    })

    /**
     * Implicit default logic (PR 5):
     * If a usage meter has exactly one price and isDefault is not explicitly set,
     * that price implicitly becomes the default.
     */
    if (prices.length === 1) {
      const singlePrice = prices[0]
      // If isDefault is not explicitly set (undefined), implicitly set it to true
      if (singlePrice.isDefault === undefined) {
        singlePrice.isDefault = true
      }
    }

    // Validate that at most one price is marked as default per meter
    const defaultPrices = prices.filter((p) => p.isDefault === true)
    if (defaultPrices.length > 1) {
      throw new Error(
        `Usage meter ${meterWithPrices.usageMeter.slug} has multiple default prices. Only one price per meter can be default.`
      )
    }
  })

  return parsed
}
