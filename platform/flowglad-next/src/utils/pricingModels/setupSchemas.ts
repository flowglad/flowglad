import { currencyCodeSchema } from '@db-core/commonZodSchema'
import { FeatureType } from '@db-core/enums'
import {
  resourceFeatureClientInsertSchema,
  toggleFeatureClientInsertSchema,
  usageCreditGrantFeatureClientInsertSchema,
} from '@db-core/schema/features'
import {
  isReservedPriceSlug,
  RESERVED_USAGE_PRICE_SLUG_SUFFIX,
  singlePaymentPriceClientInsertSchema,
  subscriptionPriceClientInsertSchema,
  usagePriceClientInsertSchema,
} from '@db-core/schema/prices'
import { pricingModelsClientInsertSchema } from '@db-core/schema/pricingModels'
import { productsClientInsertSchema } from '@db-core/schema/products'
import { resourcesClientInsertSchema } from '@db-core/schema/resources'
import { usageMetersClientInsertSchema } from '@db-core/schema/usageMeters'
import { Result } from 'better-result'
import * as R from 'ramda'
import { z } from 'zod'
import { NotFoundError, ValidationError } from '@/errors'
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
        resourceId: true,
      })
      .describe(
        'A feature that can be granted in a true / false boolean state. When granted to a customer, it will return true.'
      ),
    usageCreditGrantFeatureClientInsertSchema
      .omit({
        pricingModelId: true,
        usageMeterId: true,
        resourceId: true,
      })
      .extend({
        usageMeterSlug: z
          .string()
          .describe(
            'The slug of the usage meter to grant credit for. Must be a valid slug for a usage meter.'
          ),
      })
      .describe('A credit grant to give for a usage meter.'),
    resourceFeatureClientInsertSchema
      .omit({
        pricingModelId: true,
        usageMeterId: true,
        resourceId: true,
        renewalFrequency: true,
      })
      .extend({
        resourceSlug: z
          .string()
          .describe(
            'The slug of the resource to grant. Must be a valid slug for a resource in this pricing model.'
          ),
      })
      .describe(
        'A resource grant feature that allocates a specific amount of a resource.'
      ),
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
  slug: safeZodSanitizedString,
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
    .refine(
      // Slug is required; validate it's not using a reserved suffix
      (data) => !isReservedPriceSlug(data.slug),
      {
        message: `Usage price slugs ending with "${RESERVED_USAGE_PRICE_SLUG_SUFFIX}" are reserved for auto-generated fallback prices`,
        path: ['slug'],
      }
    )
    .refine(
      // An inactive price cannot be the default - this would leave no active default
      (data) => !(data.isDefault === true && data.active === false),
      {
        message:
          'An inactive price cannot be set as default. Set active=true or isDefault=false.',
        path: ['isDefault'],
      }
    )

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

const resourcePricingModelSetupSchema = resourcesClientInsertSchema
  .omit({
    pricingModelId: true,
  })
  .extend({
    slug: safeZodSanitizedString.describe('The slug of the resource'),
    name: safeZodSanitizedString.describe('The name of the resource'),
  })
  .describe(
    'A resource that can be claimed by subscriptions via resource features.'
  )

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
    resources: z
      .array(resourcePricingModelSetupSchema)
      .optional()
      .refine((resources) => slugsAreUnique(resources ?? []), {
        message: 'Resources must have unique slugs',
      }),
  })

export type SetupPricingModelInput = z.infer<
  typeof setupPricingModelSchema
>

export const validateSetupPricingModelInput = (
  input: SetupPricingModelInput
): Result<
  SetupPricingModelInput,
  ValidationError | NotFoundError
> => {
  return Result.gen(function* () {
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
          let current: unknown = input
          for (const key of path) {
            if (
              current &&
              typeof current === 'object' &&
              key in current
            ) {
              current = (current as Record<PropertyKey, unknown>)[key]
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
      return yield* Result.err(
        new ValidationError(
          'setupPricingModelInput',
          result.error.message
        )
      )
    }

    const parsed = result.data

    const featuresBySlug = core.groupBy(
      R.prop('slug'),
      parsed.features
    )
    const usageMetersBySlug = core.groupBy(
      (m) => m.usageMeter.slug,
      parsed.usageMeters
    )
    const resourcesBySlug = core.groupBy(
      R.prop('slug'),
      parsed.resources ?? []
    )

    // Collect all price slugs for uniqueness validation
    const allPriceSlugs = new Set<string>()

    // Validate product prices (using for loops to allow yield*)
    for (const product of parsed.products) {
      // Validate features
      for (const featureSlug of product.features) {
        const featureArr = featuresBySlug[featureSlug] || []
        const feature = featureArr[0]
        if (!feature) {
          return yield* Result.err(
            new NotFoundError('Feature', featureSlug)
          )
        }
        if (feature.type === FeatureType.UsageCreditGrant) {
          if (!usageMetersBySlug[feature.usageMeterSlug]) {
            return yield* Result.err(
              new NotFoundError('UsageMeter', feature.usageMeterSlug)
            )
          }
        }
        if (feature.type === FeatureType.Resource) {
          const resourceArr =
            resourcesBySlug[feature.resourceSlug] || []
          if (!resourceArr[0]) {
            return yield* Result.err(
              new NotFoundError('Resource', feature.resourceSlug)
            )
          }
        }
      }

      // Validate product price (subscription or single payment)
      const price = product.price
      if (!price.slug) {
        return yield* Result.err(
          new ValidationError(
            'price.slug',
            `Price slug is required. Received ${JSON.stringify(price)}`
          )
        )
      }
      if (allPriceSlugs.has(price.slug)) {
        return yield* Result.err(
          new ValidationError(
            'price.slug',
            `Price with slug ${price.slug} already exists`
          )
        )
      }
      allPriceSlugs.add(price.slug)
    }

    // Validate usage meter prices
    for (const meterWithPrices of parsed.usageMeters) {
      const prices = meterWithPrices.prices || []

      // Validate each price in the meter
      for (const price of prices) {
        if (allPriceSlugs.has(price.slug)) {
          return yield* Result.err(
            new ValidationError(
              'price.slug',
              `Price with slug ${price.slug} already exists`
            )
          )
        }
        allPriceSlugs.add(price.slug)
      }

      // Validate at most one price per usage meter has isDefault: true
      const defaultPrices = prices.filter((p) => p.isDefault)
      if (defaultPrices.length > 1) {
        return yield* Result.err(
          new ValidationError(
            'usageMeter.prices',
            `Usage meter "${meterWithPrices.usageMeter.slug}" has multiple prices with isDefault=true. ` +
              `At most one price per usage meter can be the default.`
          )
        )
      }
    }

    return Result.ok(parsed)
  })
}
