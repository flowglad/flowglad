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
  enhancedCreateInsertSchema,
  tableBase,
  notNullStringForeignKey,
  constructUniqueIndex,
  livemodePolicy,
  nullableStringForeignKey,
  SelectConditions,
} from '@/db/tableUtils'
import { discounts } from '@/db/schema/discounts'
import { purchases } from '@/db/schema/purchases'
import { createSelectSchema } from 'drizzle-zod'
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
const baseInsertSchema = enhancedCreateInsertSchema(
  discountRedemptions,
  columnRefinements
)

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

const readOnlyColumns = {
  purchaseId: true,
  discountId: true,
  discountName: true,
  discountCode: true,
  discountAmount: true,
  discountAmountType: true,
  duration: true,
  numberOfPayments: true,
  livemode: true,
} as const

// Client schemas
export const discountRedemptionsClientSelectSchema =
  discountRedemptionsSelectSchema

export namespace DiscountRedemption {
  export type Insert = z.infer<typeof discountRedemptionsInsertSchema>
  export type Update = z.infer<typeof discountRedemptionsUpdateSchema>
  export type Record = z.infer<typeof discountRedemptionsSelectSchema>
  export type ClientRecord = z.infer<
    typeof discountRedemptionsClientSelectSchema
  >
  export type Where = SelectConditions<typeof discountRedemptions>
}
