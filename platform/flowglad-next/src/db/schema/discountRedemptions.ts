import * as R from 'ramda'
import {
  integer,
  pgTable,
  text,
  pgPolicy,
  boolean,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  constructIndex,
  pgEnumColumn,
  ommittedColumnsForInsertSchema,
  tableBase,
  notNullStringForeignKey,
  constructUniqueIndex,
  livemodePolicy,
  nullableStringForeignKey,
  SelectConditions,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  enableCustomerReadPolicy,
  clientWriteOmitsConstructor,
} from '@/db/tableUtils'
import { discounts } from '@/db/schema/discounts'
import { purchases } from '@/db/schema/purchases'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { DiscountAmountType, DiscountDuration } from '@/types'
import core from '@/utils/core'
import { subscriptions } from '@/db/schema/subscriptions'
import { buildSchemas } from '../createZodSchemas'
const TABLE_NAME = 'discount_redemptions'

// Schema descriptions
const DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION =
  'A discount redemption record, which describes an instance of a discount being applied has been applied to a purchase or subscription. Currently, purchases or subscriptions can only have one discount redemption.'
const DEFAULT_DISCOUNT_REDEMPTION_DESCRIPTION =
  'A discount redemption for a one-time payment, which will only be applied once. It cannot have numberOfPayments.'
const NUMBER_OF_PAYMENTS_DISCOUNT_REDEMPTION_DESCRIPTION =
  'A discount redemption for a subscription, which will be applied for a specified number of payments. It must have numberOfPayments.'
const FOREVER_DISCOUNT_REDEMPTION_DESCRIPTION =
  'A discount redemption for a subscription, which will be applied indefinitely over the lifetime of the subscription. It cannot have numberOfPayments.'

export const discountRedemptions = pgTable(
  TABLE_NAME,
  {
    ...tableBase('discount_redemption'),
    discountId: notNullStringForeignKey('discount_id', discounts),
    purchaseId: notNullStringForeignKey('purchase_id', purchases),
    discountName: text('discount_name').notNull(),
    discountCode: text('discount_code').notNull(),
    discountAmount: integer('discount_amount').notNull(),
    discountAmountType: pgEnumColumn({
      enumName: 'DiscountAmountType',
      columnName: 'discount_amount_type',
      enumBase: DiscountAmountType,
    }).notNull(),
    duration: pgEnumColumn({
      enumName: 'DiscountDuration',
      columnName: 'duration',
      enumBase: DiscountDuration,
    }).notNull(),
    subscriptionId: nullableStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    numberOfPayments: integer('number_of_payments'),
    fullyRedeemed: boolean('fully_redeemed').notNull().default(false),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.discountId]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructUniqueIndex(TABLE_NAME, [table.purchaseId]),
      constructIndex(TABLE_NAME, [table.subscriptionId]),
      livemodePolicy(TABLE_NAME),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"subscription_id" in (select "id" from "subscriptions")`,
        }
      ),
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          to: 'all',
          using: sql`"discountId" in (select "discountId" from "Discounts" where "organization_id" in (select "organization_id" from "memberships"))`,
        }
      ),
    ]
  }
).enableRLS()

const columnRefinements = {
  discountAmount: core.safeZodPositiveInteger,
  discountAmountType: core.createSafeZodEnum(DiscountAmountType),
  duration: core.createSafeZodEnum(DiscountDuration),
  numberOfPayments: core.safeZodPositiveInteger.nullable(),
}

// Base select schema
const baseSelectSchema = createSelectSchema(
  discountRedemptions,
  columnRefinements
)
const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

const readOnlyColumns = {
  purchaseId: true,
  discountId: true,
  discountName: true,
  discountCode: true,
  discountAmount: true,
  discountAmountType: true,
  numberOfPayments: true,
  livemode: true,
} as const

export const {
  select: defaultDiscountRedemptionsSelectSchema,
  insert: defaultDiscountRedemptionsInsertSchema,
  update: defaultDiscountRedemptionsUpdateSchema,
  client: {
    select: defaultDiscountRedemptionsClientSelectSchema,
    insert: defaultDiscountRedemptionsClientInsertSchema,
    update: defaultDiscountRedemptionsClientUpdateSchema,
  },
} = buildSchemas(discountRedemptions, {
  discriminator: 'duration',
  refine: {
    ...columnRefinements,
    duration: z.literal(DiscountDuration.Once),
    numberOfPayments: z.null().optional(),
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
  },
  entityName: 'DefaultDiscountRedemption',
})

export const {
  select: numberOfPaymentsDiscountRedemptionsSelectSchema,
  insert: numberOfPaymentsDiscountRedemptionsInsertSchema,
  update: numberOfPaymentsDiscountRedemptionsUpdateSchema,
  client: {
    select: numberOfPaymentsDiscountRedemptionsClientSelectSchema,
    insert: numberOfPaymentsDiscountRedemptionsClientInsertSchema,
    update: numberOfPaymentsDiscountRedemptionsClientUpdateSchema,
  },
} = buildSchemas(discountRedemptions, {
  discriminator: 'duration',
  refine: {
    ...columnRefinements,
    duration: z.literal(DiscountDuration.NumberOfPayments),
    numberOfPayments: core.safeZodPositiveInteger,
  },
  entityName: 'NumberOfPaymentsDiscountRedemption',
})

export const {
  select: foreverDiscountRedemptionsSelectSchema,
  insert: foreverDiscountRedemptionsInsertSchema,
  update: foreverDiscountRedemptionsUpdateSchema,
  client: {
    select: foreverDiscountRedemptionsClientSelectSchema,
    insert: foreverDiscountRedemptionsClientInsertSchema,
    update: foreverDiscountRedemptionsClientUpdateSchema,
  },
} = buildSchemas(discountRedemptions, {
  discriminator: 'duration',
  refine: {
    ...columnRefinements,
    duration: z.literal(DiscountDuration.Forever),
    numberOfPayments: z.null().optional(),
  },
  entityName: 'ForeverDiscountRedemption',
})

// Combined select schema
export const discountRedemptionsSelectSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsSelectSchema,
    numberOfPaymentsDiscountRedemptionsSelectSchema,
    foreverDiscountRedemptionsSelectSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)

// Base insert schema
const baseInsertSchema = createInsertSchema(discountRedemptions)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)

// Combined insert schema
export const discountRedemptionsInsertSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsInsertSchema,
    numberOfPaymentsDiscountRedemptionsInsertSchema,
    foreverDiscountRedemptionsInsertSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)

// Combined update schema
export const discountRedemptionsUpdateSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsUpdateSchema,
    numberOfPaymentsDiscountRedemptionsUpdateSchema,
    foreverDiscountRedemptionsUpdateSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)

// Combined client select schema
export const discountRedemptionsClientSelectSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsClientSelectSchema,
    numberOfPaymentsDiscountRedemptionsClientSelectSchema,
    foreverDiscountRedemptionsClientSelectSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)
  .meta({ id: 'DiscountRedemptionsClientSelectSchema' })

// Client insert schemas for each duration type
const clientWriteOmits = clientWriteOmitsConstructor({
  ...hiddenColumns,
  ...readOnlyColumns,
})

// Combined client insert schema
export const discountRedemptionsClientInsertSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsClientInsertSchema,
    numberOfPaymentsDiscountRedemptionsClientInsertSchema,
    foreverDiscountRedemptionsClientInsertSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)
  .meta({ id: 'DiscountRedemptionsClientInsertSchema' })

// Combined client update schema
export const discountRedemptionsClientUpdateSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsClientUpdateSchema,
    numberOfPaymentsDiscountRedemptionsClientUpdateSchema,
    foreverDiscountRedemptionsClientUpdateSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)
  .meta({ id: 'DiscountRedemptionsClientUpdateSchema' })

// Update the namespace to include client types
export namespace DiscountRedemption {
  export type Insert = z.infer<typeof discountRedemptionsInsertSchema>
  export type Update = z.infer<typeof discountRedemptionsUpdateSchema>
  export type Record = z.infer<typeof discountRedemptionsSelectSchema>
  export type ClientRecord = z.infer<
    typeof discountRedemptionsClientSelectSchema
  >
  export type Where = SelectConditions<typeof discountRedemptions>
  export type ClientInsert = z.infer<
    typeof discountRedemptionsClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof discountRedemptionsClientUpdateSchema
  >
  export type ClientSelect = z.infer<
    typeof discountRedemptionsClientSelectSchema
  >
}
