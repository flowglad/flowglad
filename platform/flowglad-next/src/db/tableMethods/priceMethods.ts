import {
  Price,
  prices,
  pricesInsertSchema,
  pricesSelectSchema,
  pricesUpdateSchema,
} from '@/db/schema/prices'
import {
  createUpsertFunction,
  createSelectById,
  createSelectFunction,
  createInsertFunction,
  ORMMethodCreatorConfig,
  createBulkInsertFunction,
  createUpdateFunction,
  whereClauseFromObject,
  createPaginatedSelectFunction,
  SelectConditions,
} from '@/db/tableUtils'
import { DbTransaction } from '@/db/types'
import { and, eq, SQLWrapper } from 'drizzle-orm'
import {
  Product,
  products,
  productsSelectSchema,
} from '../schema/products'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'

const config: ORMMethodCreatorConfig<
  typeof prices,
  typeof pricesSelectSchema,
  typeof pricesInsertSchema,
  typeof pricesUpdateSchema
> = {
  selectSchema: pricesSelectSchema,
  insertSchema: pricesInsertSchema,
  updateSchema: pricesUpdateSchema,
}

export const selectPriceById = createSelectById(prices, config) as (
  id: string,
  transaction: DbTransaction
) => Promise<Price.Record>

export const upsertPriceByStripePriceId = createUpsertFunction(
  prices,
  prices.stripePriceId,
  config
)

export const bulkInsertPrices = createBulkInsertFunction(
  prices,
  config
)
export const selectPrices = createSelectFunction(prices, config)

export const insertPrice = createInsertFunction(
  prices,
  // @ts-expect-error - complex insert schema
  config
) as (
  payload: Price.Insert,
  transaction: DbTransaction
) => Promise<Price.Record>

export const updatePrice = createUpdateFunction(prices, config) as (
  payload: Price.Update,
  transaction: DbTransaction
) => Promise<Price.Record>

export const selectPricesAndProductsForOrganization = async (
  whereConditions: Partial<Price.Record>,
  organizationId: string,
  transaction: DbTransaction
) => {
  let query = transaction
    .select({
      price: prices,
      product: products,
    })
    .from(prices)
    .innerJoin(products, eq(products.id, prices.productId))
    .$dynamic()

  const whereClauses: SQLWrapper[] = [
    eq(products.organizationId, organizationId),
  ]
  if (Object.keys(whereConditions).length > 0) {
    const whereClause = whereClauseFromObject(prices, whereConditions)
    if (whereClause) {
      whereClauses.push(whereClause)
    }
  }
  query = query.where(and(...whereClauses))

  const results = await query
  return results.map((result) => ({
    product: productsSelectSchema.parse(result.product),
    price: pricesSelectSchema.parse(result.price),
  }))
}

export interface ProductWithPrices {
  product: Product.Record
  prices: Price.Record[]
}

export interface ClientProductWithPrices {
  product: Product.ClientRecord
  prices: Price.ClientRecord[]
}

const priceProductJoinResultToProductAndPrices = (
  result: {
    price: Price.Record
    product: Product.Record
  }[]
): ProductWithPrices[] => {
  const productMap = new Map<string, Product.Record>()
  const pricesMap = new Map<string, Price.Record>()

  result.forEach((item) => {
    productMap.set(item.product.id, item.product)
    pricesMap.set(item.price.id, item.price)
  })

  const products = Array.from(productMap.values())
  const prices = Array.from(pricesMap.values())

  return products.map((product) => ({
    product,
    prices: prices.filter((price) => price.productId === product.id),
  }))
}

export const selectPricesAndProductByProductId = async (
  productId: string,
  transaction: DbTransaction
): Promise<ProductWithPrices> => {
  const results = await transaction
    .select({
      price: prices,
      product: products,
    })
    .from(prices)
    .innerJoin(products, eq(products.id, prices.productId))
    .where(eq(products.id, productId))

  const parsedResults: {
    product: Product.Record
    price: Price.Record
  }[] = results.map((result) => ({
    product: productsSelectSchema.parse(result.product),
    price: pricesSelectSchema.parse(result.price),
  }))

  const [normalizedResult] =
    priceProductJoinResultToProductAndPrices(parsedResults)
  return normalizedResult
}

export const selectPricesAndProductsByProductWhere = async (
  whereConditions: SelectConditions<typeof products>,
  transaction: DbTransaction
): Promise<ProductWithPrices[]> => {
  const results = await transaction
    .select({
      price: prices,
      product: products,
    })
    .from(prices)
    .innerJoin(products, eq(products.id, prices.productId))
    .where(whereClauseFromObject(products, whereConditions))

  const parsedResults: {
    product: Product.Record
    price: Price.Record
  }[] = results.map((result) => ({
    product: productsSelectSchema.parse(result.product),
    price: pricesSelectSchema.parse(result.price),
  }))

  return priceProductJoinResultToProductAndPrices(parsedResults)
}

export const selectDefaultPriceAndProductByProductId = async (
  productId: string,
  transaction: DbTransaction
) => {
  const { prices, product } = await selectPricesAndProductByProductId(
    productId,
    transaction
  )

  const defaultPrice =
    prices.find((price) => price.isDefault) ?? prices[0]

  if (!defaultPrice) {
    throw new Error(`No default price found for product ${productId}`)
  }
  return {
    price: defaultPrice,
    product,
  }
}

export const selectPriceProductAndOrganizationByPriceWhere = async (
  whereConditions: Partial<Price.Record>,
  transaction: DbTransaction
) => {
  let query = transaction
    .select({
      price: prices,
      product: products,
      organization: organizations,
    })
    .from(prices)
    .innerJoin(products, eq(products.id, prices.productId))
    .innerJoin(
      organizations,
      eq(products.organizationId, organizations.id)
    )
    .$dynamic()

  const whereClause = whereClauseFromObject(prices, whereConditions)
  if (whereClause) {
    query = query.where(whereClause)
  }

  const results = await query
  return results.map((result) => ({
    price: pricesSelectSchema.parse(result.price),
    product: productsSelectSchema.parse(result.product),
    organization: organizationsSelectSchema.parse(
      result.organization
    ),
  }))
}

export const selectPricesPaginated = createPaginatedSelectFunction(
  prices,
  config
)

export const makePriceDefault = async (
  priceOrId: Price.Record | string,
  transaction: DbTransaction
) => {
  const newDefaultPrice =
    typeof priceOrId === 'string'
      ? await selectPriceById(priceOrId, transaction)
      : priceOrId

  const { price: oldDefaultPrice } = (
    await selectPriceProductAndOrganizationByPriceWhere(
      { isDefault: true },
      transaction
    )
  )[0]

  if (oldDefaultPrice) {
    await updatePrice(
      {
        id: oldDefaultPrice.id,
        isDefault: false,
        type: oldDefaultPrice.type,
      },
      transaction
    )
  }

  const updatedPrice = await updatePrice(
    {
      id: newDefaultPrice.id,
      isDefault: true,
      type: newDefaultPrice.type,
    },
    transaction
  )
  return updatedPrice
}
