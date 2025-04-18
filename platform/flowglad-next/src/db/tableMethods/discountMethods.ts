import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createDeleteFunction,
  createPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  discounts,
  discountsInsertSchema,
  discountsSelectSchema,
  discountsUpdateSchema,
  discountsTableRowDataSchema,
} from '@/db/schema/discounts'
import { eq, desc, count, inArray } from 'drizzle-orm'
import { DbTransaction } from '@/db/types'
import { discountRedemptions } from '@/db/schema/discountRedemptions'

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

export const selectDiscountsTableRowData = async (
  organizationId: string,
  transaction: DbTransaction
) => {
  // First, get all discounts for the organization
  const discountsData = await transaction
    .select({
      discount: discounts,
    })
    .from(discounts)
    .where(eq(discounts.organizationId, organizationId))
    .orderBy(desc(discounts.createdAt))

  // Get the discount IDs for this organization
  const discountIds = discountsData.map((row) => row.discount.id)

  // Get redemption counts for all discounts
  const redemptionCounts = await transaction
    .select({
      discountId: discountRedemptions.discountId,
      count: count(),
    })
    .from(discountRedemptions)
    .where(inArray(discountRedemptions.discountId, discountIds))
    .groupBy(discountRedemptions.discountId)

  // Create a map of discountId to redemption count
  const redemptionCountMap = new Map(
    redemptionCounts.map((item) => [item.discountId, item.count])
  )

  // Combine the data
  return discountsData.map((row) =>
    discountsTableRowDataSchema.parse({
      discount: row.discount,
      discountRedemptionsCount:
        redemptionCountMap.get(row.discount.id) || 0,
    })
  )
}
