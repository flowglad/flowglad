import { catalogsClientInsertSchema } from '@/db/schema/catalogs'
import {
  featuresClientInsertSchema,
  toggleFeatureClientInsertSchema,
  usageCreditGrantFeatureClientInsertSchema,
} from '@/db/schema/features'
import {
  subscriptionPriceClientInsertSchema,
  singlePaymentPriceClientInsertSchema,
  usagePriceClientInsertSchema,
} from '@/db/schema/prices'
import { productsClientInsertSchema } from '@/db/schema/products'
import { usageMetersClientInsertSchema } from '@/db/schema/usageMeters'
import { z } from 'zod'
import core from '../core'
import * as R from 'ramda'
import { FeatureType, PriceType } from '@/types'

export const featureCatalogSetupSchema = z
  .discriminatedUnion('type', [
    toggleFeatureClientInsertSchema
      .omit({
        catalogId: true,
        usageMeterId: true,
        amount: true,
        renewalFrequency: true,
      })
      .describe(
        'A feature that can be granted in a true / false boolean state. When granted to a customer, it will return true.'
      ),
    usageCreditGrantFeatureClientInsertSchema
      .omit({
        catalogId: true,
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

const productCatalogSetupSchema = productsClientInsertSchema
  .omit({
    catalogId: true,
  })
  .describe(
    'A product, which describes "what" a customer gets when they purchase via features, and how much they pay via prices.'
  )

const omitProductId = {
  productId: true,
} as const

export const setupCatalogProductPriceInputSchema =
  z.discriminatedUnion('type', [
    subscriptionPriceClientInsertSchema.omit(omitProductId),
    singlePaymentPriceClientInsertSchema.omit(omitProductId),
    usagePriceClientInsertSchema
      .omit(omitProductId)
      .omit({
        usageMeterId: true,
      })
      .extend({
        usageMeterSlug: z.string(),
      }),
  ])

export type SetupCatalogProductPriceInput = z.infer<
  typeof setupCatalogProductPriceInputSchema
>

const setupCatalogProductInputSchema = z.object({
  product: productCatalogSetupSchema.describe(
    'The product to add to the catalog. Must be a subset of the products in the catalog.'
  ),
  prices: z
    .array(setupCatalogProductPriceInputSchema)
    .describe(
      'The prices to add to the product. Must be a subset of the prices in the catalog.'
    ),
  features: z
    .array(z.string())
    .describe(
      'The slugs of the features that will granted when they purchase the product. Must be a subset of the slugs of the features in the catalog.'
    ),
})

export type SetupCatalogProductInput = z.infer<
  typeof setupCatalogProductInputSchema
>

export const setupCatalogSchema = catalogsClientInsertSchema.extend({
  isDefault: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Whether the catalog to be created will be the default catalog for all customers moving forward.'
    ),
  features: z.array(featureCatalogSetupSchema),
  products: z.array(setupCatalogProductInputSchema),
  usageMeters: z.array(
    usageMetersClientInsertSchema
      .omit({
        catalogId: true,
      })
      .describe(
        'The usage meters to add to the catalog. If the catalog has any prices that are based on usage, each dimension along which usage will be tracked will need its own meter.'
      )
  ),
})

export type SetupCatalogInput = z.infer<typeof setupCatalogSchema>

export const validateSetupCatalogInput = (
  input: SetupCatalogInput
) => {
  const parsed = setupCatalogSchema.parse(input)

  const featuresBySlug = core.groupBy(R.prop('slug'), parsed.features)
  const usageMetersBySlug = core.groupBy(
    R.prop('slug'),
    parsed.usageMeters
  )
  const featureSlugs = Object.keys(featuresBySlug)
  featureSlugs.forEach((slug) => {
    const feature = featuresBySlug[slug]
    if (feature.length > 1) {
      throw new Error(`Feature with slug ${slug} already exists`)
    }
  })
  const usageMeterSlugs = Object.keys(usageMetersBySlug)
  usageMeterSlugs.forEach((slug) => {
    const usageMeter = usageMetersBySlug[slug]
    if (usageMeter.length > 1) {
      throw new Error(`Usage meter with slug ${slug} already exists`)
    }
  })
  const pricesBySlug = core.groupBy(
    R.propOr(null, 'slug'),
    parsed.products.flatMap((p) => p.prices)
  )
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

    // Validate prices
    product.prices.forEach((price) => {
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
      }
      const priceSlugs = pricesBySlug[price.slug]
      if (priceSlugs && priceSlugs.length > 1) {
        throw new Error(
          `Price with slug ${price.slug} already exists`
        )
      }
    })
  })
  return parsed
}
