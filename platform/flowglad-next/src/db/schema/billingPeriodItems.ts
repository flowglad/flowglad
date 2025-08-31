import * as R from 'ramda'
import { integer, pgTable, text, pgPolicy } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  tableBase,
  notNullStringForeignKey,
  nullableStringForeignKey,
  constructIndex,
  livemodePolicy,
  createSupabaseWebhookSchema,
  ommittedColumnsForInsertSchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
  pgEnumColumn,
  merchantRole,
} from '@/db/tableUtils'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { subscriptionItems } from '@/db/schema/subscriptionItems'
import { discountRedemptions } from '@/db/schema/discountRedemptions'
import core from '@/utils/core'
import { createSelectSchema } from 'drizzle-zod'
import { sql } from 'drizzle-orm'
import { usageMeters } from './usageMeters'
import { SubscriptionItemType } from '@/types'

const TABLE_NAME = 'billing_period_items'

const STATIC_BILLING_PERIOD_ITEM_DESCRIPTION =
  'A static billing period item, representing a fixed fee component for a billing period.'
const USAGE_BILLING_PERIOD_ITEM_DESCRIPTION =
  'A usage-based billing period item, where charges are based on recorded usage events for a billing period.'
const BILLING_PERIOD_ITEM_SELECT_SCHEMA_DESCRIPTION =
  'A billing period item record, detailing a specific charge within a billing period. Can be static or usage-based.'
const BILLING_PERIOD_ITEM_INSERT_SCHEMA_DESCRIPTION =
  'A new billing period item.'
const BILLING_PERIOD_ITEM_UPDATE_SCHEMA_DESCRIPTION =
  'Schema for updating an existing billing period item.'

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
    usageEventsPerUnit: integer('usage_events_per_unit'),
    usageMeterId: nullableStringForeignKey(
      'usage_meter_id',
      usageMeters
    ),
    type: pgEnumColumn({
      enumName: 'SubscriptionItemType',
      columnName: 'type',
      enumBase: SubscriptionItemType,
    }).notNull(),
    description: text('description').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.billingPeriodId]),
      constructIndex(TABLE_NAME, [table.discountRedemptionId]),
      constructIndex(TABLE_NAME, [table.usageMeterId]),
      pgPolicy(`Enable read for own organizations (${TABLE_NAME})`, {
        as: 'permissive',
        to: merchantRole,
        for: 'all',
        using: sql`"billingPeriodId" in (select "id" from "BillingPeriods" where "subscriptionId" in (select "id" from "Subscriptions" where "organization_id" in (select "organization_id" from "memberships")))`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const baseColumnRefinements = {
  quantity: core.safeZodPositiveInteger,
  // type refinement is handled by discriminated union literals
}

const baseBillingPeriodItemSelectSchema = createSelectSchema(
  billingPeriodItems,
  baseColumnRefinements
)

// Static Billing Period Item Schemas
export const staticBillingPeriodItemSelectSchema =
  baseBillingPeriodItemSelectSchema
    .extend({
      type: z.literal(SubscriptionItemType.Static),
      usageMeterId: z
        .null()
        .describe(
          'Usage meter ID must be null for static billing period items.'
        ),
      usageEventsPerUnit: z
        .null()
        .describe(
          'Usage events per unit must be null for static billing period items.'
        ),
    })
    .describe(STATIC_BILLING_PERIOD_ITEM_DESCRIPTION)

export const staticBillingPeriodItemInsertSchema =
  staticBillingPeriodItemSelectSchema
    .omit(ommittedColumnsForInsertSchema)
    .describe(STATIC_BILLING_PERIOD_ITEM_DESCRIPTION)

export const staticBillingPeriodItemUpdateSchema =
  staticBillingPeriodItemInsertSchema
    .partial()
    .extend({
      id: z.string(),
      type: z.literal(SubscriptionItemType.Static), // Type cannot be changed
    })
    .describe(STATIC_BILLING_PERIOD_ITEM_DESCRIPTION)

// Usage Billing Period Item Schemas
export const usageBillingPeriodItemSelectSchema =
  baseBillingPeriodItemSelectSchema
    .extend({
      type: z.literal(SubscriptionItemType.Usage),
      usageMeterId: z
        .string()
        .describe(
          'The usage meter associated with this usage-based billing period item.'
        ), // Overrides base nullable
      usageEventsPerUnit: core.safeZodPositiveInteger.describe(
        'The number of usage events that constitute one unit for billing.'
      ), // Overrides base nullable
    })
    .describe(USAGE_BILLING_PERIOD_ITEM_DESCRIPTION)

export const usageBillingPeriodItemInsertSchema =
  usageBillingPeriodItemSelectSchema
    .omit(ommittedColumnsForInsertSchema)
    .describe(USAGE_BILLING_PERIOD_ITEM_DESCRIPTION)

export const usageBillingPeriodItemUpdateSchema =
  usageBillingPeriodItemInsertSchema
    .partial()
    .extend({
      id: z.string(),
      type: z.literal(SubscriptionItemType.Usage), // Type cannot be changed
    })
    .describe(USAGE_BILLING_PERIOD_ITEM_DESCRIPTION)

/*
 * database schemas
 */
export const billingPeriodItemsInsertSchema = z
  .discriminatedUnion('type', [
    staticBillingPeriodItemInsertSchema,
    usageBillingPeriodItemInsertSchema,
  ])
  .describe(BILLING_PERIOD_ITEM_INSERT_SCHEMA_DESCRIPTION)

export const billingPeriodItemsSelectSchema = z
  .discriminatedUnion('type', [
    staticBillingPeriodItemSelectSchema,
    usageBillingPeriodItemSelectSchema,
  ])
  .describe(BILLING_PERIOD_ITEM_SELECT_SCHEMA_DESCRIPTION)

export const billingPeriodItemsUpdateSchema = z
  .discriminatedUnion('type', [
    staticBillingPeriodItemUpdateSchema,
    usageBillingPeriodItemUpdateSchema,
  ])
  .describe(BILLING_PERIOD_ITEM_UPDATE_SCHEMA_DESCRIPTION)

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

// Static Billing Period Item Client Schemas
export const staticBillingPeriodItemClientInsertSchema =
  staticBillingPeriodItemInsertSchema.omit(clientWriteOmits).meta({
    id: 'StaticBillingPeriodItemInsert',
  })
export const staticBillingPeriodItemClientUpdateSchema =
  staticBillingPeriodItemUpdateSchema.omit(clientWriteOmits).meta({
    id: 'StaticBillingPeriodItemUpdate',
  })

export const staticBillingPeriodItemClientSelectSchema =
  staticBillingPeriodItemSelectSchema.omit(hiddenColumns).meta({
    id: 'StaticBillingPeriodItemRecord',
  })

// Usage Billing Period Item Client Schemas
export const usageBillingPeriodItemClientInsertSchema =
  usageBillingPeriodItemInsertSchema.omit(clientWriteOmits).meta({
    id: 'UsageBillingPeriodItemInsert',
  })
export const usageBillingPeriodItemClientUpdateSchema =
  usageBillingPeriodItemUpdateSchema.omit(clientWriteOmits).meta({
    id: 'UsageBillingPeriodItemUpdate',
  })

export const usageBillingPeriodItemClientSelectSchema =
  usageBillingPeriodItemSelectSchema.omit(hiddenColumns).meta({
    id: 'UsageBillingPeriodItemRecord',
  })

// Client Discriminated Union Schemas
export const billingPeriodItemClientInsertSchema = z
  .discriminatedUnion('type', [
    staticBillingPeriodItemClientInsertSchema,
    usageBillingPeriodItemClientInsertSchema,
  ])
  .meta({ id: 'BillingPeriodItemClientInsertSchema' })

export const billingPeriodItemClientUpdateSchema = z
  .discriminatedUnion('type', [
    staticBillingPeriodItemClientUpdateSchema,
    usageBillingPeriodItemClientUpdateSchema,
  ])
  .meta({ id: 'BillingPeriodItemClientUpdateSchema' })

export const billingPeriodItemClientSelectSchema = z
  .discriminatedUnion('type', [
    staticBillingPeriodItemClientSelectSchema,
    usageBillingPeriodItemClientSelectSchema,
  ])
  .meta({ id: 'BillingPeriodItemClientSelectSchema' })

export namespace BillingPeriodItem {
  export type Insert = z.infer<typeof billingPeriodItemsInsertSchema>
  export type Update = z.infer<typeof billingPeriodItemsUpdateSchema>
  export type Record = z.infer<typeof billingPeriodItemsSelectSchema>

  export type StaticInsert = z.infer<
    typeof staticBillingPeriodItemInsertSchema
  >
  export type StaticUpdate = z.infer<
    typeof staticBillingPeriodItemUpdateSchema
  >
  export type StaticRecord = z.infer<
    typeof staticBillingPeriodItemSelectSchema
  >

  export type UsageInsert = z.infer<
    typeof usageBillingPeriodItemInsertSchema
  >
  export type UsageUpdate = z.infer<
    typeof usageBillingPeriodItemUpdateSchema
  >
  export type UsageRecord = z.infer<
    typeof usageBillingPeriodItemSelectSchema
  >

  export type ClientInsert = z.infer<
    typeof billingPeriodItemClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof billingPeriodItemClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof billingPeriodItemClientSelectSchema
  >

  export type ClientStaticInsert = z.infer<
    typeof staticBillingPeriodItemClientInsertSchema
  >
  export type ClientStaticUpdate = z.infer<
    typeof staticBillingPeriodItemClientUpdateSchema
  >
  export type ClientStaticRecord = z.infer<
    typeof staticBillingPeriodItemClientSelectSchema
  >

  export type ClientUsageInsert = z.infer<
    typeof usageBillingPeriodItemClientInsertSchema
  >
  export type ClientUsageUpdate = z.infer<
    typeof usageBillingPeriodItemClientUpdateSchema
  >
  export type ClientUsageRecord = z.infer<
    typeof usageBillingPeriodItemClientSelectSchema
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
