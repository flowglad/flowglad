import { bulkInsertProducts } from '@/db/tableMethods/productMethods'
import { bulkInsertPrices } from '@/db/tableMethods/priceMethods'
import { DbTransaction } from '@/db/types'
import { Price } from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { safelyInsertCatalog } from '@/db/tableMethods/catalogMethods'
import { Catalog } from '@/db/schema/catalogs'
import { bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId } from '@/db/tableMethods/productFeatureMethods'
import {
  SetupCatalogInput,
  SetupCatalogProductInput,
  validateSetupCatalogInput,
} from '@/utils/catalogs/setupSchemas'
import { Feature } from '@/db/schema/features'
import { bulkInsertOrDoNothingUsageMetersBySlugAndCatalogId } from '@/db/tableMethods/usageMeterMethods'
import { FeatureType, PriceType } from '@/types'
import { bulkInsertOrDoNothingFeaturesByCatalogIdAndSlug } from '@/db/tableMethods/featureMethods'
import { hashData } from '@/utils/backendCore'
import { UsageMeter } from '@/db/schema/usageMeters'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { ProductFeature } from '@/db/schema/productFeatures'

export const externalIdFromProductData = (
  product: SetupCatalogProductInput,
  catalogId: string
) => {
  return hashData(JSON.stringify({ ...product, catalogId }))
}

export const setupCatalogTransaction = async (
  {
    input: rawInput,
    organizationId,
    livemode,
  }: {
    input: SetupCatalogInput
    organizationId: string
    livemode: boolean
  },
  transaction: DbTransaction
) => {
  const input = validateSetupCatalogInput(rawInput)
  const catalogInsert: Catalog.Insert = {
    name: input.name,
    livemode,
    organizationId,
    isDefault: input.isDefault,
  }
  const organization = await selectOrganizationById(
    organizationId,
    transaction
  )
  const catalog = await safelyInsertCatalog(
    catalogInsert,
    transaction
  )
  const usageMeterInserts: UsageMeter.Insert[] =
    input.usageMeters.map((usageMeter) => ({
      slug: usageMeter.slug,
      name: usageMeter.name,
      livemode,
      organizationId,
      catalogId: catalog.id,
    }))
  const usageMeters =
    await bulkInsertOrDoNothingUsageMetersBySlugAndCatalogId(
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
        | 'catalogId'
        | 'livemode'
        | 'organizationId'
        | 'name'
        | 'description'
      > = {
        slug: feature.slug,
        name: feature.name,
        description: feature.description,
        catalogId: catalog.id,
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
    await bulkInsertOrDoNothingFeaturesByCatalogIdAndSlug(
      featureInserts,
      transaction
    )
  const productInserts: Product.Insert[] = input.products.map(
    (product) => {
      return {
        ...product.product,
        catalogId: catalog.id,
        livemode,
        organizationId,
        externalId: externalIdFromProductData(product, catalog.id),
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
        externalIdFromProductData(product, catalog.id)
      )?.id
      if (!productId) {
        throw new Error(`Product ${product.product.name} not found`)
      }
      return product.prices.map((price) => {
        if (price.type === PriceType.Usage) {
          const usageMeterId = usageMetersBySlug.get(
            price.usageMeterSlug
          )?.id
          if (!usageMeterId) {
            throw new Error(
              `Usage meter ${price.usageMeterSlug} not found`
            )
          }
          return {
            ...price,
            currency: organization.defaultCurrency,
            productId,
            livemode,
            externalId: null,
            usageMeterId,
          }
        }
        return {
          ...price,
          currency: organization.defaultCurrency,
          productId,
          livemode,
          externalId: null,
        }
      })
    }
  )

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
          externalIdFromProductData(product, catalog.id)
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
    catalog,
    products,
    prices,
    features,
    productFeatures,
    usageMeters,
  }
}
