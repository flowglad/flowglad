import {
  Variant,
  variants,
  variantsInsertSchema,
  variantsSelectSchema,
  variantsUpdateSchema,
} from '@/db/schema/variants'
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
  typeof variants,
  typeof variantsSelectSchema,
  typeof variantsInsertSchema,
  typeof variantsUpdateSchema
> = {
  selectSchema: variantsSelectSchema,
  insertSchema: variantsInsertSchema,
  updateSchema: variantsUpdateSchema,
}

export const selectVariantById = createSelectById(
  variants,
  config
) as (
  id: string,
  transaction: DbTransaction
) => Promise<Variant.Record>

export const upsertVariantByStripePriceId = createUpsertFunction(
  variants,
  variants.stripePriceId,
  config
)

export const bulkInsertVariants = createBulkInsertFunction(
  variants,
  config
)
export const selectVariants = createSelectFunction(variants, config)

export const insertVariant = createInsertFunction(
  variants,
  // @ts-expect-error complex types
  config
) as (
  payload: Variant.Insert,
  transaction: DbTransaction
) => Promise<Variant.Record>

export const updateVariant = createUpdateFunction(
  variants,
  config
) as (
  payload: Variant.Update,
  transaction: DbTransaction
) => Promise<Variant.Record>

export const selectVariantsAndProductsForOrganization = async (
  whereConditions: Partial<Variant.Record>,
  organizationId: string,
  transaction: DbTransaction
) => {
  let query = transaction
    .select({
      variant: variants,
      product: products,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .$dynamic()

  const whereClauses: SQLWrapper[] = [
    eq(products.organizationId, organizationId),
  ]
  if (Object.keys(whereConditions).length > 0) {
    const whereClause = whereClauseFromObject(
      variants,
      whereConditions
    )
    if (whereClause) {
      whereClauses.push(whereClause)
    }
  }
  query = query.where(and(...whereClauses))

  const results = await query
  return results.map((result) => ({
    product: productsSelectSchema.parse(result.product),
    variant: variantsSelectSchema.parse(result.variant),
  }))
}

export const selectVariantsAndProductByProductId = async (
  productId: string,
  transaction: DbTransaction
) => {
  const results = await transaction
    .select({
      variant: variants,
      product: products,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(products.id, productId))

  const parsedResults: {
    product: Product.Record
    variant: Variant.Record
  }[] = results.map((result) => ({
    product: productsSelectSchema.parse(result.product),
    variant: variantsSelectSchema.parse(result.variant),
  }))

  const finalResult: {
    product: Product.Record
    variants: Variant.Record[]
  } = {
    product: parsedResults[0].product,
    variants: parsedResults.map((result) => result.variant),
  }
  return finalResult
}

export const selectDefaultVariantAndProductByProductId = async (
  productId: string,
  transaction: DbTransaction
) => {
  const { variants, product } =
    await selectVariantsAndProductByProductId(productId, transaction)

  const defaultVariant =
    variants.find((variant) => variant.isDefault) ?? variants[0]

  if (!defaultVariant) {
    throw new Error(
      `No default variant found for product ${productId}`
    )
  }
  return {
    variant: defaultVariant,
    product,
  }
}

export const selectVariantProductAndOrganizationByVariantWhere =
  async (
    whereConditions: Partial<Variant.Record>,
    transaction: DbTransaction
  ) => {
    let query = transaction
      .select({
        variant: variants,
        product: products,
        organization: organizations,
      })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .innerJoin(
        organizations,
        eq(products.organizationId, organizations.id)
      )
      .$dynamic()

    const whereClause = whereClauseFromObject(
      variants,
      whereConditions
    )
    if (whereClause) {
      query = query.where(whereClause)
    }

    const results = await query
    return results.map((result) => ({
      variant: variantsSelectSchema.parse(result.variant),
      product: productsSelectSchema.parse(result.product),
      organization: organizationsSelectSchema.parse(
        result.organization
      ),
    }))
  }

export const selectVariantsPaginated = createPaginatedSelectFunction(
  variants,
  config
)
