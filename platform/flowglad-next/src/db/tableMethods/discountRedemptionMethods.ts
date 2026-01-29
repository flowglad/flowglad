import {
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
  whereClauseFromObject,
} from '@db-core/tableUtils'
import { eq } from 'drizzle-orm'
import * as R from 'ramda'
import {
  type DiscountRedemption,
  discountRedemptions,
  discountRedemptionsInsertSchema,
  discountRedemptionsSelectSchema,
  discountRedemptionsUpdateSchema,
} from '@/db/schema/discountRedemptions'
import type { DbTransaction } from '@/db/types'
import {
  type Discount,
  discounts,
  discountsSelectSchema,
} from '../schema/discounts'
import type { Purchase } from '../schema/purchases'
import { derivePricingModelIdFromPurchase } from './purchaseMethods'

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

const baseInsertDiscountRedemption = createInsertFunction(
  discountRedemptions,
  config
)

export const insertDiscountRedemption = async (
  discountRedemptionInsert: DiscountRedemption.Insert,
  transaction: DbTransaction
): Promise<DiscountRedemption.Record> => {
  const pricingModelId = discountRedemptionInsert.pricingModelId
    ? discountRedemptionInsert.pricingModelId
    : await derivePricingModelIdFromPurchase(
        discountRedemptionInsert.purchaseId,
        transaction
      )
  return baseInsertDiscountRedemption(
    {
      ...discountRedemptionInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateDiscountRedemption = createUpdateFunction(
  discountRedemptions,
  config
)

const baseUpsertDiscountRedemptionByPurchaseId = createUpsertFunction(
  discountRedemptions,
  [discountRedemptions.purchaseId],
  config
)

export const upsertDiscountRedemptionByPurchaseId = async (
  discountRedemptionInsert: DiscountRedemption.Insert,
  transaction: DbTransaction
) => {
  const pricingModelId = discountRedemptionInsert.pricingModelId
    ? discountRedemptionInsert.pricingModelId
    : await derivePricingModelIdFromPurchase(
        discountRedemptionInsert.purchaseId,
        transaction
      )
  return baseUpsertDiscountRedemptionByPurchaseId(
    {
      ...discountRedemptionInsert,
      pricingModelId,
    },
    transaction
  )
}

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
