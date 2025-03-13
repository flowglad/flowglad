import {
  createSelectById,
  createSelectFunction,
  createInsertFunction,
  createUpdateFunction,
  ORMMethodCreatorConfig,
  createUpsertFunction,
} from '@/db/tableUtils'
import {
  discountRedemptions,
  discountRedemptionsSelectSchema,
  discountRedemptionsInsertSchema,
  discountRedemptionsUpdateSchema,
} from '@/db/schema/discountRedemptions'
import { Purchase } from '../schema/purchases'
import {
  Discount,
  discounts,
  discountsSelectSchema,
} from '../schema/discounts'
import { DbTransaction } from '@/db/types'
import { eq } from 'drizzle-orm'

const config: ORMMethodCreatorConfig<
  typeof discountRedemptions,
  typeof discountRedemptionsSelectSchema,
  typeof discountRedemptionsInsertSchema,
  typeof discountRedemptionsUpdateSchema
> = {
  selectSchema: discountRedemptionsSelectSchema,
  insertSchema: discountRedemptionsInsertSchema,
  updateSchema: discountRedemptionsUpdateSchema,
}

export const selectDiscountRedemptionById = createSelectById(
  discountRedemptions,
  config
)

export const selectDiscountRedemptions = createSelectFunction(
  discountRedemptions,
  config
)

export const insertDiscountRedemption = createInsertFunction(
  discountRedemptions,
  config
)

export const updateDiscountRedemption = createUpdateFunction(
  discountRedemptions,
  config
)

export const upsertDiscountRedemptionByPurchaseId =
  createUpsertFunction(
    discountRedemptions,
    [discountRedemptions.purchaseId],
    config
  )

export const upsertDiscountRedemptionForPurchaseAndDiscount = async (
  purchase: Purchase.Record,
  discount: Discount.Record,
  transaction: DbTransaction
) => {
  const discountRedemptionsInsert =
    discountRedemptionsInsertSchema.parse({
      discountId: discount.id,
      discountName: discount.name,
      discountCode: discount.code,
      discountAmount: discount.amount,
      discountAmountType: discount.amountType,
      purchaseId: purchase.id,
      duration: discount.duration,
      numberOfPayments: discount.numberOfPayments,
      livemode: purchase.livemode,
    })
  const result = await upsertDiscountRedemptionByPurchaseId(
    discountRedemptionsInsert,
    transaction
  )
  return result[0]
}

export const selectDiscountAndDiscountRedemptionByPurchaseId = async (
  purchaseId: string,
  transaction: DbTransaction
) => {
  const [result] = await transaction
    .select({
      discount: discounts,
      discountRedemption: discountRedemptions,
    })
    .from(discountRedemptions)
    .innerJoin(
      discounts,
      eq(discountRedemptions.discountId, discounts.id)
    )
    .where(eq(discountRedemptions.purchaseId, purchaseId))
  if (!result) {
    return null
  }
  return {
    discount: discountsSelectSchema.parse(result.discount),
    discountRedemption: discountRedemptionsSelectSchema.parse(
      result.discountRedemption
    ),
  }
}
