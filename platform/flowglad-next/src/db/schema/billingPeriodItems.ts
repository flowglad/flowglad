import * as R from 'ramda'
import { integer, pgTable, text, pgPolicy } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  tableBase,
  notNullStringForeignKey,
  nullableStringForeignKey,
  constructIndex,
  enhancedCreateInsertSchema,
  createUpdateSchema,
  livemodePolicy,
  createSupabaseWebhookSchema,
  ommittedColumnsForInsertSchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
} from '@/db/tableUtils'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { subscriptionItems } from '@/db/schema/subscriptionItems'
import { discountRedemptions } from '@/db/schema/discountRedemptions'
import core from '@/utils/core'
import { createSelectSchema } from 'drizzle-zod'
import { sql } from 'drizzle-orm'

const TABLE_NAME = 'billing_period_items'

export const billingPeriodItems = pgTable(
  TABLE_NAME,
  {
    ...tableBase('billing_period_item'),
    billingPeriodId: notNullStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(),
    name: text('name').notNull(),
    discountRedemptionId: nullableStringForeignKey(
      'discount_redemption_id',
      discountRedemptions
    ),
    description: text('description').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.billingPeriodId]),
      constructIndex(TABLE_NAME, [table.discountRedemptionId]),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"billingPeriodId" in (select "id" from "BillingPeriods" where "subscriptionId" in (select "id" from "Subscriptions" where "organization_id" in (select "organization_id" from "memberships")))`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  quantity: core.safeZodPositiveInteger,
}

/*
 * database schemas
 */
export const billingPeriodItemsInsertSchema =
  enhancedCreateInsertSchema(billingPeriodItems, columnRefinements)

export const billingPeriodItemsSelectSchema = createSelectSchema(
  billingPeriodItems
).extend(columnRefinements)

export const billingPeriodItemsUpdateSchema = createUpdateSchema(
  billingPeriodItems,
  columnRefinements
)

const createOnlyColumns = {
  billingPeriodId: true,
  discountRedemptionId: true,
} as const

const readOnlyColumns = {} as const

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
  ...createOnlyColumns,
} as const

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
})

/*
 * client schemas
 */
export const billingPeriodItemClientInsertSchema =
  billingPeriodItemsInsertSchema.omit(clientWriteOmits)

export const billingPeriodItemClientUpdateSchema =
  billingPeriodItemsUpdateSchema.omit({
    ...clientWriteOmits,
    ...createOnlyColumns,
  })

export const billingPeriodItemClientSelectSchema =
  billingPeriodItemsSelectSchema.omit(hiddenColumns)

export namespace BillingPeriodItem {
  export type Insert = z.infer<typeof billingPeriodItemsInsertSchema>
  export type Update = z.infer<typeof billingPeriodItemsUpdateSchema>
  export type Record = z.infer<typeof billingPeriodItemsSelectSchema>
  export type ClientInsert = z.infer<
    typeof billingPeriodItemClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof billingPeriodItemClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof billingPeriodItemClientSelectSchema
  >
  export type Where = SelectConditions<typeof billingPeriodItems>
}

export const createBillingPeriodItemInputSchema = z.object({
  billingPeriodItem: billingPeriodItemClientInsertSchema,
})

export type CreateBillingPeriodItemInput = z.infer<
  typeof createBillingPeriodItemInputSchema
>

export const editBillingPeriodItemInputSchema = z.object({
  billingPeriodItem: billingPeriodItemClientUpdateSchema,
})

export type EditBillingPeriodItemInput = z.infer<
  typeof editBillingPeriodItemInputSchema
>
