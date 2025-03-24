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
import { DbTransaction } from '../types'

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

export const selectProducts = createSelectFunction(products, config)

export const insertProduct = createInsertFunction(products, config)

export const updateProduct = createUpdateFunction(products, config)

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

export const bulkInsertProducts = async (
  productInserts: Product.Insert[],
  transaction: DbTransaction
): Promise<Product.Record[]> => {
  const results = await transaction
    .insert(products)
    .values(productInserts)
    .returning()
  return results.map((result) => productsSelectSchema.parse(result))
}
