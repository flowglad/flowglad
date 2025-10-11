import * as R from 'ramda'
import { integer, pgTable, text, pgPolicy } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  tableBase,
  notNullStringForeignKey,
  nullableStringForeignKey,
  constructIndex,
  livemodePolicy,
  ommittedColumnsForInsertSchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
  pgEnumColumn,
  merchantPolicy,
  clientWriteOmitsConstructor,
} from '@/db/tableUtils'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { discountRedemptions } from '@/db/schema/discountRedemptions'
import core from '@/utils/core'
import { createSelectSchema } from 'drizzle-zod'
import { sql } from 'drizzle-orm'
import { usageMeters } from './usageMeters'
import { SubscriptionItemType } from '@/types'
import { buildSchemas } from '../createZodSchemas'

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
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          for: 'all',
          using: sql`"billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "subscriptions" where "organization_id" in (select "organization_id" from "memberships")))`,
        }
      ),
      livemodePolicy(TABLE_NAME),
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

const createOnlyColumns = {
  billingPeriodId: true,
  discountRedemptionId: true,
} as const

const readOnlyColumns = {} as const

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

export const {
  select: staticBillingPeriodItemSelectSchema,
  insert: staticBillingPeriodItemInsertSchema,
  update: staticBillingPeriodItemUpdateSchema,
  client: {
    select: staticBillingPeriodItemClientSelectSchema,
    insert: staticBillingPeriodItemClientInsertSchema,
    update: staticBillingPeriodItemClientUpdateSchema,
  },
} = buildSchemas(billingPeriodItems, {
  discriminator: 'type',
  refine: {
    type: z.literal(SubscriptionItemType.Static),
    usageMeterId: z
      .null()
      .optional()
      .describe(
        'Usage meter ID must be null for static billing period items.'
      ),
    usageEventsPerUnit: z
      .null()
      .optional()
      .describe(
        'Usage events per unit must be null for static billing period items.'
      ),
  },
  client: {
    hiddenColumns,
    createOnlyColumns,
    readOnlyColumns,
  },
  entityName: 'StaticBillingPeriodItem',
})

export const {
  select: usageBillingPeriodItemSelectSchema,
  insert: usageBillingPeriodItemInsertSchema,
  update: usageBillingPeriodItemUpdateSchema,
  client: {
    select: usageBillingPeriodItemClientSelectSchema,
    insert: usageBillingPeriodItemClientInsertSchema,
    update: usageBillingPeriodItemClientUpdateSchema,
  },
} = buildSchemas(billingPeriodItems, {
  discriminator: 'type',
  refine: {
    type: z.literal(SubscriptionItemType.Usage),
    usageMeterId: z
      .string()
      .describe(
        'The usage meter associated with this usage-based billing period item.'
      ), // Overrides base nullable
    usageEventsPerUnit: core.safeZodPositiveInteger.describe(
      'The number of usage events that constitute one unit for billing.'
    ), // Overrides base nullable
  },
  entityName: 'UsageBillingPeriodItem',
})

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

/*
 * client schemas
 */

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
