import * as R from 'ramda'
import {
  createSelectById,
  createSelectFunction,
  createInsertFunction,
  createUpdateFunction,
  ORMMethodCreatorConfig,
  createUpsertFunction,
  whereClauseFromObject,
} from '@/db/tableUtils'
import {
  discountRedemptions,
  discountRedemptionsSelectSchema,
  discountRedemptionsInsertSchema,
  discountRedemptionsUpdateSchema,
  DiscountRedemption,
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
  tableName: 'discount_redemptions',
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

export const selectDiscountAndDiscountRedemptionByDiscountRedemptionWhere =
  async (
    where: DiscountRedemption.Where,
    transaction: DbTransaction
  ) => {
    let query = transaction
      .select({
        discount: discounts,
        discountRedemption: discountRedemptions,
      })
      .from(discountRedemptions)
      .innerJoin(
        discounts,
        eq(discountRedemptions.discountId, discounts.id)
      )
      .$dynamic()
    if (!R.isEmpty(where)) {
      query = query.where(
        whereClauseFromObject(discountRedemptions, where)
      )
    }
    const [result] = await query
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
