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
} from '@/db/tableUtils'
import { discounts } from '@/db/schema/discounts'
import { purchases } from '@/db/schema/purchases'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { DiscountAmountType, DiscountDuration } from '@/types'
import core from '@/utils/core'
import { subscriptions } from '@/db/schema/subscriptions'
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
      livemodePolicy(),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"discountId" in (select "discountId" from "Discounts" where "organization_id" in (select "organization_id" from "memberships"))`,
      }),
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

// Duration-specific select schemas
export const defaultDiscountRedemptionsSelectSchema = baseSelectSchema
  .extend({
    duration: z.literal(DiscountDuration.Once),
    numberOfPayments: z.null(),
  })
  .describe(DEFAULT_DISCOUNT_REDEMPTION_DESCRIPTION)

export const numberOfPaymentsDiscountRedemptionsSelectSchema =
  baseSelectSchema
    .extend({
      duration: z.literal(DiscountDuration.NumberOfPayments),
      numberOfPayments: core.safeZodPositiveInteger,
    })
    .describe(NUMBER_OF_PAYMENTS_DISCOUNT_REDEMPTION_DESCRIPTION)

export const foreverDiscountRedemptionsSelectSchema = baseSelectSchema
  .extend({
    duration: z.literal(DiscountDuration.Forever),
    numberOfPayments: z.null(),
  })
  .describe(FOREVER_DISCOUNT_REDEMPTION_DESCRIPTION)

// Combined select schema
export const discountRedemptionsSelectSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsSelectSchema,
    numberOfPaymentsDiscountRedemptionsSelectSchema,
    foreverDiscountRedemptionsSelectSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)

// Base insert schema
const baseInsertSchema = createInsertSchema(discountRedemptions).omit(ommittedColumnsForInsertSchema).extend(columnRefinements)

// Duration-specific insert schemas
export const defaultDiscountRedemptionsInsertSchema =
  baseInsertSchema.extend({
    duration: z.literal(DiscountDuration.Once),
    numberOfPayments: z.null(),
  })

export const numberOfPaymentsDiscountRedemptionsInsertSchema =
  baseInsertSchema.extend({
    duration: z.literal(DiscountDuration.NumberOfPayments),
    numberOfPayments: core.safeZodPositiveInteger,
  })

export const foreverDiscountRedemptionsInsertSchema =
  baseInsertSchema.extend({
    duration: z.literal(DiscountDuration.Forever),
    numberOfPayments: z.null(),
  })

// Combined insert schema
export const discountRedemptionsInsertSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsInsertSchema,
    numberOfPaymentsDiscountRedemptionsInsertSchema,
    foreverDiscountRedemptionsInsertSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)

// Duration-specific update schemas
export const defaultDiscountRedemptionsUpdateSchema =
  defaultDiscountRedemptionsSelectSchema.partial().extend({
    id: z.string(),
    duration: z.literal(DiscountDuration.Once),
    numberOfPayments: z.null(),
  })

export const numberOfPaymentsDiscountRedemptionsUpdateSchema =
  numberOfPaymentsDiscountRedemptionsSelectSchema.partial().extend({
    id: z.string(),
    duration: z.literal(DiscountDuration.NumberOfPayments),
    numberOfPayments: core.safeZodPositiveInteger,
  })

export const foreverDiscountRedemptionsUpdateSchema =
  foreverDiscountRedemptionsSelectSchema.partial().extend({
    id: z.string(),
    duration: z.literal(DiscountDuration.Forever),
    numberOfPayments: z.null(),
  })

// Combined update schema
export const discountRedemptionsUpdateSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsUpdateSchema,
    numberOfPaymentsDiscountRedemptionsUpdateSchema,
    foreverDiscountRedemptionsUpdateSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)

// Client select schemas for each duration type
export const defaultDiscountRedemptionsClientSelectSchema =
  defaultDiscountRedemptionsSelectSchema
    .omit(hiddenColumns)
    .describe(DEFAULT_DISCOUNT_REDEMPTION_DESCRIPTION)

export const numberOfPaymentsDiscountRedemptionsClientSelectSchema =
  numberOfPaymentsDiscountRedemptionsSelectSchema
    .omit(hiddenColumns)
    .describe(NUMBER_OF_PAYMENTS_DISCOUNT_REDEMPTION_DESCRIPTION)

export const foreverDiscountRedemptionsClientSelectSchema =
  foreverDiscountRedemptionsSelectSchema
    .omit(hiddenColumns)
    .describe(FOREVER_DISCOUNT_REDEMPTION_DESCRIPTION)

// Combined client select schema
export const discountRedemptionsClientSelectSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsClientSelectSchema,
    numberOfPaymentsDiscountRedemptionsClientSelectSchema,
    foreverDiscountRedemptionsClientSelectSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)

// Client insert schemas for each duration type
const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
})

export const defaultDiscountRedemptionsClientInsertSchema =
  defaultDiscountRedemptionsInsertSchema
    .omit(clientWriteOmits)
    .describe(DEFAULT_DISCOUNT_REDEMPTION_DESCRIPTION)

export const numberOfPaymentsDiscountRedemptionsClientInsertSchema =
  numberOfPaymentsDiscountRedemptionsInsertSchema
    .omit(clientWriteOmits)
    .describe(NUMBER_OF_PAYMENTS_DISCOUNT_REDEMPTION_DESCRIPTION)

export const foreverDiscountRedemptionsClientInsertSchema =
  foreverDiscountRedemptionsInsertSchema
    .omit(clientWriteOmits)
    .describe(FOREVER_DISCOUNT_REDEMPTION_DESCRIPTION)

// Combined client insert schema
export const discountRedemptionsClientInsertSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsClientInsertSchema,
    numberOfPaymentsDiscountRedemptionsClientInsertSchema,
    foreverDiscountRedemptionsClientInsertSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)

// Client update schemas for each duration type
export const defaultDiscountRedemptionsClientUpdateSchema =
  defaultDiscountRedemptionsUpdateSchema
    .omit(hiddenColumns)
    .omit(readOnlyColumns)
    .describe(DEFAULT_DISCOUNT_REDEMPTION_DESCRIPTION)

export const numberOfPaymentsDiscountRedemptionsClientUpdateSchema =
  numberOfPaymentsDiscountRedemptionsUpdateSchema
    .omit(hiddenColumns)
    .omit(readOnlyColumns)
    .describe(NUMBER_OF_PAYMENTS_DISCOUNT_REDEMPTION_DESCRIPTION)

export const foreverDiscountRedemptionsClientUpdateSchema =
  foreverDiscountRedemptionsUpdateSchema
    .omit(hiddenColumns)
    .omit(readOnlyColumns)
    .describe(FOREVER_DISCOUNT_REDEMPTION_DESCRIPTION)

// Combined client update schema
export const discountRedemptionsClientUpdateSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountRedemptionsClientUpdateSchema,
    numberOfPaymentsDiscountRedemptionsClientUpdateSchema,
    foreverDiscountRedemptionsClientUpdateSchema,
  ])
  .describe(DISCOUNT_REDEMPTIONS_BASE_DESCRIPTION)

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
