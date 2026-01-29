import { buildSchemas } from '@db-core/createZodSchemas'
import {
  clientWriteOmitsConstructor,
  constructIndex,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  ommittedColumnsForInsertSchema,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
} from '@db-core/tableUtils'
import { sql } from 'drizzle-orm'
import { integer, pgPolicy, pgTable, text } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { discountRedemptions } from '@/db/schema/discountRedemptions'
import { SubscriptionItemType } from '@/types'
import core from '@/utils/core'
import { pricingModels } from './pricingModels'
import { usageMeters } from './usageMeters'

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
    type: pgEnumColumn({
      enumName: 'SubscriptionItemType',
      columnName: 'type',
      enumBase: SubscriptionItemType,
    }).notNull(),
    description: text('description').notNull(),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.billingPeriodId]),
    constructIndex(TABLE_NAME, [table.discountRedemptionId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        for: 'all',
        using: sql`"billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "subscriptions" where "organization_id"=current_organization_id()))`,
      }
    ),
  ])
).enableRLS()

const baseColumnRefinements = {
  quantity: core.safeZodPositiveInteger,
  type: z.literal(SubscriptionItemType.Static), // disallow usage type
}

const baseBillingPeriodItemSelectSchema = createSelectSchema(
  billingPeriodItems,
  baseColumnRefinements
)

const createOnlyColumns = {
  billingPeriodId: true,
  discountRedemptionId: true,
} as const

const readOnlyColumns = {
  pricingModelId: true,
} as const

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
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    createOnlyColumns,
    readOnlyColumns,
  },
  entityName: 'StaticBillingPeriodItem',
})

/*
 * database schemas
 */
export const billingPeriodItemsInsertSchema = z
  .discriminatedUnion('type', [staticBillingPeriodItemInsertSchema])
  .describe(BILLING_PERIOD_ITEM_INSERT_SCHEMA_DESCRIPTION)

export const billingPeriodItemsSelectSchema = z
  .discriminatedUnion('type', [staticBillingPeriodItemSelectSchema])
  .describe(BILLING_PERIOD_ITEM_SELECT_SCHEMA_DESCRIPTION)

export const billingPeriodItemsUpdateSchema = z
  .discriminatedUnion('type', [staticBillingPeriodItemUpdateSchema])
  .describe(BILLING_PERIOD_ITEM_UPDATE_SCHEMA_DESCRIPTION)

/*
 * client schemas
 */

// Client Discriminated Union Schemas
export const billingPeriodItemClientInsertSchema = z
  .discriminatedUnion('type', [
    staticBillingPeriodItemClientInsertSchema,
  ])
  .meta({ id: 'BillingPeriodItemClientInsertSchema' })

export const billingPeriodItemClientUpdateSchema = z
  .discriminatedUnion('type', [
    staticBillingPeriodItemClientUpdateSchema,
  ])
  .meta({ id: 'BillingPeriodItemClientUpdateSchema' })

export const billingPeriodItemClientSelectSchema = z
  .discriminatedUnion('type', [
    staticBillingPeriodItemClientSelectSchema,
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
