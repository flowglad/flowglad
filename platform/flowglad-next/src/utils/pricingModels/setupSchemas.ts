import * as R from 'ramda'
import { z } from 'zod'
import { currencyCodeSchema } from '@/db/commonZodSchema'
import {
  resourceFeatureClientInsertSchema,
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
import { resourcesClientInsertSchema } from '@/db/schema/resources'
import { usageMetersClientInsertSchema } from '@/db/schema/usageMeters'
import { CurrencyCode, FeatureType, PriceType } from '@/types'
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
    resourceFeatureClientInsertSchema
      .omit({
        pricingModelId: true,
        resourceId: true,
      })
      .extend({
        resourceSlug: z
          .string()
          .describe(
            'The slug of the resource to grant. Must be a valid slug for a resource.'
          ),
      })
      .describe(
        'A resource grant feature that grants a specified amount of a resource.'
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
  slug: safeZodSanitizedString.optional(),
} as const

export const setupPricingModelProductPriceInputSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceClientInsertSchema.omit(omitProductId).extend({
      ...priceOptionalFieldSchema,
    }),
    singlePaymentPriceClientInsertSchema.omit(omitProductId).extend({
      ...priceOptionalFieldSchema,
    }),
    usagePriceClientInsertSchema
      .omit(omitProductId)
      .omit({
        usageMeterId: true,
      })
      .extend({
        usageMeterSlug: z.string(),
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
    usageMeters: z
      .array(
        usageMetersClientInsertSchema
          .omit({
            pricingModelId: true,
          })
          .describe(
            'The usage meters to add to the pricingModel. If the pricingModel has any prices that are based on usage, each dimension along which usage will be tracked will need its own meter.'
          )
      )
      .refine(slugsAreUnique, {
        message: 'Usage meters must have unique slugs',
      }),
    resources: z
      .array(
        resourcesClientInsertSchema
          .omit({
            pricingModelId: true,
          })
          .describe(
            'A resource that can be granted in amounts by Resource features. Resources represent countable things like seats, API calls, or storage.'
          )
      )
      .refine(slugsAreUnique, {
        message: 'Resources must have unique slugs',
      })
      .optional()
      .default([]),
  })

/**
 * Type for pricing model setup data - after validation with defaults applied.
 * All fields are required (including resources, which defaults to []).
 * Use this type when working with validated data.
 */
export type SetupPricingModelInput = z.output<
  typeof setupPricingModelSchema
>

/**
 * Input type for setupPricingModelSchema - before validation.
 * Resources and isDefault are optional (they have defaults).
 * Use this type for function parameters that accept unvalidated input.
 */
export type SetupPricingModelRawInput = z.input<
  typeof setupPricingModelSchema
>

export const validateSetupPricingModelInput = (
  input: SetupPricingModelRawInput
): SetupPricingModelInput => {
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
    R.prop('slug'),
    parsed.usageMeters
  )
  const pricesBySlug = core.groupBy(
    R.propOr(null, 'slug'),
    parsed.products.map((p) => p.price)
  )
  const usagePriceMeterSlugs = new Set<string>()
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

    // Validate price
    const price = product.price
    if (!price.slug) {
      throw new Error(
        `Price slug is required. Received ${JSON.stringify(price)}`
      )
    }
    if (price.type === PriceType.Usage) {
      if (!price.usageMeterSlug) {
        throw new Error(
          `Usage meter slug is required for usage price`
        )
      }
      const usageArr = usageMetersBySlug[price.usageMeterSlug] || []
      const usageMeter = usageArr[0]
      if (!usageMeter) {
        throw new Error(
          `Usage meter with slug ${price.usageMeterSlug} does not exist`
        )
      }
      usagePriceMeterSlugs.add(price.usageMeterSlug)
    }
    const priceSlugs = pricesBySlug[price.slug]
    if (priceSlugs && priceSlugs.length > 1) {
      throw new Error(`Price with slug ${price.slug} already exists`)
    }
  })
  const usageMeterSlugs = Object.keys(usageMetersBySlug)
  usageMeterSlugs.forEach((slug) => {
    if (!usagePriceMeterSlugs.has(slug)) {
      throw new Error(
        `Usage meter with slug ${slug} must have at least one usage price associated with it`
      )
    }
  })
  return parsed
}
