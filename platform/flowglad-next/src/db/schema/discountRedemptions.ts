import { integer, pgTable, text, pgPolicy } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  constructIndex,
  pgEnumColumn,
  enhancedCreateInsertSchema,
  tableBase,
  createUpdateSchema,
  notNullStringForeignKey,
  constructUniqueIndex,
  livemodePolicy,
} from '@/db/tableUtils'
import { discounts } from '@/db/schema/discounts'
import { purchases } from '@/db/schema/purchases'
import { createSelectSchema } from 'drizzle-zod'
import { DiscountAmountType, DiscountDuration } from '@/types'
import core from '@/utils/core'

const TABLE_NAME = 'DiscountRedemptions'

export const discountRedemptions = pgTable(
  TABLE_NAME,
  {
    ...tableBase('discountRedemption'),
    discountId: notNullStringForeignKey('discountId', discounts),
    purchaseId: notNullStringForeignKey('PurchaseId', purchases),
    discountName: text('discountName').notNull(),
    discountCode: text('discountCode').notNull(),
    discountAmount: integer('discountAmount').notNull(),
    discountAmountType: pgEnumColumn({
      enumName: 'DiscountAmountType',
      columnName: 'discountAmountType',
      enumBase: DiscountAmountType,
    }).notNull(),
    duration: pgEnumColumn({
      enumName: 'DiscountDuration',
      columnName: 'duration',
      enumBase: DiscountDuration,
    }).notNull(),
    numberOfPayments: integer('numberOfPayments'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.discountId]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructUniqueIndex(TABLE_NAME, [table.purchaseId]),
      livemodePolicy(),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"discountId" in (select "discountId" from "Discounts" where "organizationId" in (select "organizationId" from "Memberships"))`,
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
export const defaultDiscountRedemptionsSelectSchema =
  baseSelectSchema.extend({
    duration: z.literal(DiscountDuration.Once),
    numberOfPayments: z.null(),
  })

export const numberOfPaymentsDiscountRedemptionsSelectSchema =
  baseSelectSchema.extend({
    duration: z.literal(DiscountDuration.NumberOfPayments),
    numberOfPayments: core.safeZodPositiveInteger,
  })

export const foreverDiscountRedemptionsSelectSchema =
  baseSelectSchema.extend({
    duration: z.literal(DiscountDuration.Forever),
    numberOfPayments: z.null(),
  })

// Combined select schema
export const discountRedemptionsSelectSchema = z.discriminatedUnion(
  'duration',
  [
    defaultDiscountRedemptionsSelectSchema,
    numberOfPaymentsDiscountRedemptionsSelectSchema,
    foreverDiscountRedemptionsSelectSchema,
  ]
)

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
export const discountRedemptionsInsertSchema = z.discriminatedUnion(
  'duration',
  [
    defaultDiscountRedemptionsInsertSchema,
    numberOfPaymentsDiscountRedemptionsInsertSchema,
    foreverDiscountRedemptionsInsertSchema,
  ]
)

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
export const discountRedemptionsUpdateSchema = z.discriminatedUnion(
  'duration',
  [
    defaultDiscountRedemptionsUpdateSchema,
    numberOfPaymentsDiscountRedemptionsUpdateSchema,
    foreverDiscountRedemptionsUpdateSchema,
  ]
)

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
}
