import * as R from 'ramda'

import {
  createUpsertFunction,
  createSelectById,
  createSelectFunction,
  createInsertFunction,
  ORMMethodCreatorConfig,
  createUpdateFunction,
  createPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  Product,
  products,
  productsInsertSchema,
  productsSelectSchema,
  productsUpdateSchema,
} from '@/db/schema/products'
import { ProperNoun } from '../schema/properNouns'

const config: ORMMethodCreatorConfig<
  typeof products,
  typeof productsSelectSchema,
  typeof productsInsertSchema,
  typeof productsUpdateSchema
> = {
  selectSchema: productsSelectSchema,
  insertSchema: productsInsertSchema,
  updateSchema: productsUpdateSchema,
}

export const selectProductById = createSelectById(products, config)

export const upsertProductByStripeProductId = createUpsertFunction(
  products,
  products.stripeProductId,
  config
)

export const selectProducts = createSelectFunction(products, config)

export const insertProduct = createInsertFunction(products, config)

export const updateProduct = createUpdateFunction(products, config)

/**
 * Removes nulls from left joined results, and return unique assets.
 * @param assets
 * @returns
 */
const getUniqueAssetsFromAssociatedAssetsQuery = <
  T extends { id: string },
>(
  assets: (T | null)[]
): T[] => {
  return R.uniqBy<T, string>(
    (asset) => asset.id,
    R.reject(R.isNil, assets)
  )
}

export const productToProperNounUpsert = (
  product: Product.Record
): ProperNoun.Insert => {
  return {
    name: product.name,
    entityId: product.id,
    entityType: 'product',
    organizationId: product.organizationId,
    livemode: product.livemode,
  }
}

export const selectProductsPaginated = createPaginatedSelectFunction(
  products,
  config
)
