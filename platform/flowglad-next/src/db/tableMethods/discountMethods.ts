import { count, eq, inArray } from 'drizzle-orm'
import type { z } from 'zod'
import { discountRedemptions } from '@/db/schema/discountRedemptions'
import {
  discounts,
  discountsInsertSchema,
  discountsSelectSchema,
  discountsTableRowDataSchema,
  discountsUpdateSchema,
} from '@/db/schema/discounts'
import { pricingModels } from '@/db/schema/pricingModels'
import {
  createCursorPaginatedSelectFunction,
  createDeleteFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'

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

// Extract the core redemption count calculation logic
const getRedemptionCountsMap = async (
  discountIds: string[],
  transaction: DbTransaction
): Promise<Map<string, number>> => {
  if (discountIds.length === 0) {
    return new Map()
  }

  const redemptionCounts = await transaction
    .select({
      discountId: discountRedemptions.discountId,
      count: count(),
    })
    .from(discountRedemptions)
    .where(inArray(discountRedemptions.discountId, discountIds))
    .groupBy(discountRedemptions.discountId)

  return new Map(
    redemptionCounts.map((item) => [item.discountId, item.count])
  )
}

// Export function to add redemption count directly to discount objects (for list endpoint)
export const enrichDiscountsWithRedemptionCounts = async (
  discounts: z.infer<typeof discountsSelectSchema>[],
  transaction: DbTransaction
) => {
  const discountIds = discounts.map((discount) => discount.id)
  const redemptionCountMap = await getRedemptionCountsMap(
    discountIds,
    transaction
  )

  return discounts.map((discount) => ({
    ...discount,
    redemptionCount: redemptionCountMap.get(discount.id) || 0,
  }))
}

// Keep existing enrichmentFunction for getTableRowsProcedure (returns { discount, redemptionCount, pricingModel })
const enrichmentFunction = async (
  data: z.infer<typeof discountsSelectSchema>[],
  transaction: DbTransaction
) => {
  const discountIds = data.map((discount) => discount.id)
  const redemptionCountMap = await getRedemptionCountsMap(
    discountIds,
    transaction
  )

  // Get pricing model info for all discounts
  const pricingModelIds = [
    ...new Set(data.map((d) => d.pricingModelId)),
  ]
  const pricingModelData =
    pricingModelIds.length > 0
      ? await transaction
          .select({
            id: pricingModels.id,
            name: pricingModels.name,
          })
          .from(pricingModels)
          .where(inArray(pricingModels.id, pricingModelIds))
      : []
  const pricingModelMap = new Map(
    pricingModelData.map((pm) => [pm.id, pm])
  )

  return data.map((discount) => ({
    discount,
    redemptionCount: redemptionCountMap.get(discount.id) || 0,
    pricingModel: pricingModelMap.get(discount.pricingModelId) || {
      id: discount.pricingModelId,
      name: 'Unknown',
    },
  }))
}

export const selectDiscountsTableRowData =
  createCursorPaginatedSelectFunction(
    discounts,
    config,
    discountsTableRowDataSchema,
    enrichmentFunction
  )
