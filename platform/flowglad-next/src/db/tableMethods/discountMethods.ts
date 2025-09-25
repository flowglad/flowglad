import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createDeleteFunction,
  createPaginatedSelectFunction,
  createCursorPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  discounts,
  discountsInsertSchema,
  discountsSelectSchema,
  discountsUpdateSchema,
  discountsTableRowDataSchema,
} from '@/db/schema/discounts'
import { count, inArray } from 'drizzle-orm'
import { DbTransaction } from '@/db/types'
import { discountRedemptions } from '@/db/schema/discountRedemptions'
import { z } from 'zod'

const config: ORMMethodCreatorConfig<
  typeof discounts,
  typeof discountsSelectSchema,
  typeof discountsInsertSchema,
  typeof discountsUpdateSchema
> = {
  selectSchema: discountsSelectSchema,
  insertSchema: discountsInsertSchema,
  updateSchema: discountsUpdateSchema,
  tableName: 'discounts',
}

export const selectDiscountById = createSelectById(discounts, config)
export const insertDiscount = createInsertFunction(discounts, config)
export const updateDiscount = createUpdateFunction(discounts, config)
export const selectDiscounts = createSelectFunction(discounts, config)
export const deleteDiscount = createDeleteFunction(discounts)

export const selectDiscountsPaginated = createPaginatedSelectFunction(
  discounts,
  config
)

const enrichmentFunction = async (
  data: z.infer<typeof discountsSelectSchema>[],
  transaction: DbTransaction
) => {
  const discountIds = data.map((discount) => discount.id)

  const redemptionCounts = await transaction
    .select({
      discountId: discountRedemptions.discountId,
      count: count(),
    })
    .from(discountRedemptions)
    .where(inArray(discountRedemptions.discountId, discountIds))
    .groupBy(discountRedemptions.discountId)

  const redemptionCountMap = new Map(
    redemptionCounts.map((item) => [item.discountId, item.count])
  )

  return data.map((discount) => ({
    discount,
    discountRedemptionsCount:
      redemptionCountMap.get(discount.id) || 0,
  }))
}

export const selectDiscountsTableRowData =
  createCursorPaginatedSelectFunction(
    discounts,
    config,
    discountsTableRowDataSchema,
    enrichmentFunction,
    // Searchable columns for discounts table
    [discounts.name, discounts.code]
  )
