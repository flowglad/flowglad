import * as R from 'ramda'
import {
  pgTable,
  pgPolicy,
  text,
  boolean,
  integer,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  enhancedCreateInsertSchema,
  pgEnumColumn,
  constructIndex,
  constructUniqueIndex,
  tableBase,
  notNullStringForeignKey,
  createSupabaseWebhookSchema,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import core from '@/utils/core'
import { createSelectSchema } from 'drizzle-zod'
import { sql } from 'drizzle-orm'
import { DiscountAmountType, DiscountDuration } from '@/types'

const TABLE_NAME = 'discounts'

// Schema descriptions
const DISCOUNTS_BASE_DESCRIPTION =
  'A discount record, which describes a discount that can be applied to purchases or subscriptions. Discounts can be one-time, have a fixed number of payments, or be applied indefinitely.'
const DEFAULT_DISCOUNT_DESCRIPTION =
  'A one-time discount that will only be applied once to a purchase or subscription.'
const NUMBER_OF_PAYMENTS_DISCOUNT_DESCRIPTION =
  'A discount that will be applied for a specified number of payments on a subscription.'
const FOREVER_DISCOUNT_DESCRIPTION =
  'A discount that will be applied indefinitely over the lifetime of a subscription.'

export const discounts = pgTable(
  TABLE_NAME,
  {
    ...tableBase('discount'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    name: text('name').notNull(),
    code: text('code').notNull(),
    amount: integer('amount').notNull(),
    amountType: pgEnumColumn({
      enumName: 'DiscountAmountType',
      columnName: 'amount_type',
      enumBase: DiscountAmountType,
    }).notNull(),
    active: boolean('active').notNull().default(true),
    duration: pgEnumColumn({
      enumName: 'DiscountDuration',
      columnName: 'duration',
      enumBase: DiscountDuration,
    }).notNull(),
    numberOfPayments: integer('number_of_payments'),
    // externalId: text('external_id').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.code]),
      constructUniqueIndex(TABLE_NAME, [
        table.code,
        table.organizationId,
      ]),
      livemodePolicy(),
      pgPolicy(
        'Enable all actions for discounts in own organization',
        {
          as: 'permissive',
          to: 'authenticated',
          for: 'all',
          using: sql`"organization_id" in (select "organization_id" from "memberships")`,
        }
      ),
    ]
  }
).enableRLS()

const columnRefinements = {
  amount: core.safeZodPositiveInteger,
  amountType: core.createSafeZodEnum(DiscountAmountType),
  duration: core.createSafeZodEnum(DiscountDuration),
  numberOfPayments: core.safeZodPositiveInteger.nullable(),
  code: z
    .string()
    .min(3)
    .max(20)
    .transform((code) => code.toUpperCase()),
}

const baseDiscountSchema = enhancedCreateInsertSchema(
  discounts,
  columnRefinements
)

const supabaseSchemas = createSupabaseWebhookSchema({
  table: discounts,
  tableName: TABLE_NAME,
  refine: columnRefinements,
})

export const discountsSupabaseInsertPayloadSchema =
  supabaseSchemas.supabaseInsertPayloadSchema
export const discountsSupabaseUpdatePayloadSchema =
  supabaseSchemas.supabaseUpdatePayloadSchema

const defaultDiscountsRefinements = {
  duration: z.literal(DiscountDuration.Once),
  numberOfPayments: z.null(),
}

const foreverDiscountsRefinements = {
  duration: z.literal(DiscountDuration.Forever),
  numberOfPayments: z.null(),
}

const numberOfPaymentsDiscountsRefinements = {
  duration: z.literal(DiscountDuration.NumberOfPayments),
  numberOfPayments: core.safeZodPositiveInteger,
}

// Default discounts schema (once or forever duration)
export const defaultDiscountsInsertSchema = baseDiscountSchema.extend(
  defaultDiscountsRefinements
)

// Number of payments discounts schema
export const numberOfPaymentsDiscountsInsertSchema =
  baseDiscountSchema.extend(numberOfPaymentsDiscountsRefinements)

export const foreverDiscountsInsertSchema = baseDiscountSchema.extend(
  foreverDiscountsRefinements
)

// Combined insert schema
export const discountsInsertSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountsInsertSchema,
    numberOfPaymentsDiscountsInsertSchema,
    foreverDiscountsInsertSchema,
  ])
  .describe(DISCOUNTS_BASE_DESCRIPTION)

// Select schemas
const baseSelectSchema = createSelectSchema(
  discounts,
  columnRefinements
)

export const defaultDiscountsSelectSchema = baseSelectSchema.extend(
  defaultDiscountsRefinements
)

export const numberOfPaymentsDiscountsSelectSchema =
  baseSelectSchema.extend(numberOfPaymentsDiscountsRefinements)

export const foreverDiscountsSelectSchema = baseSelectSchema.extend(
  foreverDiscountsRefinements
)

export const discountsSelectSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountsSelectSchema,
    numberOfPaymentsDiscountsSelectSchema,
    foreverDiscountsSelectSchema,
  ])
  .describe(DISCOUNTS_BASE_DESCRIPTION)

// Update schemas
export const defaultDiscountsUpdateSchema =
  defaultDiscountsSelectSchema.partial().extend({
    id: z.string(),
    duration: z.literal(DiscountDuration.Once),
    numberOfPayments: z.null(),
  })

export const numberOfPaymentsDiscountsUpdateSchema =
  numberOfPaymentsDiscountsSelectSchema.partial().extend({
    id: z.string(),
    duration: z.literal(DiscountDuration.NumberOfPayments),
    numberOfPayments: core.safeZodPositiveInteger,
  })

export const foreverDiscountsUpdateSchema =
  foreverDiscountsSelectSchema.partial().extend({
    id: z.string(),
    duration: z.literal(DiscountDuration.Forever),
    numberOfPayments: z.null(),
  })

export const discountsUpdateSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountsUpdateSchema,
    numberOfPaymentsDiscountsUpdateSchema,
    foreverDiscountsUpdateSchema,
  ])
  .describe(DISCOUNTS_BASE_DESCRIPTION)

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
} as const

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
})

export const defaultDiscountClientInsertSchema =
  defaultDiscountsInsertSchema.omit(clientWriteOmits)

export const numberOfPaymentsDiscountClientInsertSchema =
  numberOfPaymentsDiscountsInsertSchema.omit(clientWriteOmits)

export const foreverDiscountClientInsertSchema =
  foreverDiscountsInsertSchema.omit(clientWriteOmits)

export const discountClientInsertSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountsInsertSchema,
    numberOfPaymentsDiscountsInsertSchema,
    foreverDiscountsInsertSchema,
  ])
  .describe(DISCOUNTS_BASE_DESCRIPTION)

export const defaultDiscountClientUpdateSchema =
  defaultDiscountsUpdateSchema.omit(nonClientEditableColumns)

export const numberOfPaymentsDiscountClientUpdateSchema =
  numberOfPaymentsDiscountsUpdateSchema.omit(nonClientEditableColumns)

export const foreverDiscountClientUpdateSchema =
  foreverDiscountsUpdateSchema.omit(nonClientEditableColumns)

export const discountClientUpdateSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountClientUpdateSchema,
    numberOfPaymentsDiscountClientUpdateSchema,
    foreverDiscountClientUpdateSchema,
  ])
  .describe(DISCOUNTS_BASE_DESCRIPTION)

export const defaultDiscountClientSelectSchema =
  defaultDiscountsSelectSchema.omit(hiddenColumns)

export const numberOfPaymentsDiscountClientSelectSchema =
  numberOfPaymentsDiscountsSelectSchema.omit(hiddenColumns)

export const foreverDiscountClientSelectSchema =
  foreverDiscountsSelectSchema.omit(hiddenColumns)

export const discountClientSelectSchema = z
  .discriminatedUnion('duration', [
    foreverDiscountClientSelectSchema,
    numberOfPaymentsDiscountClientSelectSchema,
    defaultDiscountClientSelectSchema,
  ])
  .describe(DISCOUNTS_BASE_DESCRIPTION)

export const discountsPaginatedSelectSchema =
  createPaginatedSelectSchema(discountClientSelectSchema)

export const discountsPaginatedListSchema =
  createPaginatedListQuerySchema(discountClientSelectSchema)

export const discountsTableRowDataSchema = z.object({
  discount: discountClientSelectSchema,
  discountRedemptionsCount: z.number(),
})

export namespace Discount {
  export type Insert = z.infer<typeof discountsInsertSchema>
  export type Update = z.infer<typeof discountsUpdateSchema>
  export type Record = z.infer<typeof discountsSelectSchema>
  export type ClientInsert = z.infer<
    typeof discountClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof discountClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof discountClientSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof discountsPaginatedListSchema
  >
  export type Where = SelectConditions<typeof discounts>
  export type TableRowData = z.infer<
    typeof discountsTableRowDataSchema
  >
}

export const createDiscountInputSchema = z.object({
  discount: discountClientInsertSchema,
})
export type CreateDiscountInput = z.infer<
  typeof createDiscountInputSchema
>

export const editDiscountInputSchema = z.object({
  discount: discountClientUpdateSchema,
  id: z.string(),
})

export type EditDiscountInput = z.infer<
  typeof editDiscountInputSchema
>

export const productIdOrPurchaseIdSchema = z
  .object({
    productId: z.string(),
  })
  .or(
    z.object({
      purchaseId: z.string(),
    })
  )

export const attemptDiscountCodeInputSchema = z
  .object({
    code: z.string(),
  })
  .and(productIdOrPurchaseIdSchema)

export type AttemptDiscountCodeInput = z.infer<
  typeof attemptDiscountCodeInputSchema
>
