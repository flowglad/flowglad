import * as R from 'ramda'
import { pgTable, text, boolean, integer } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  ommittedColumnsForInsertSchema,
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
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import core from '@/utils/core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
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
        table.livemode,
      ]),
      livemodePolicy(TABLE_NAME),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"organization_id" = current_organization_id() and "active" = true`,
        }
      ),
      merchantPolicy(
        'Enable all actions for discounts in own organization',
        {
          as: 'permissive',
          to: 'all',
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
    .transform((code) => code.toUpperCase())
    .meta({
      description:
        'The discount code, must be unique and between 3 and 20 characters.',
    }),
}

const baseDiscountSchema = createInsertSchema(discounts)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)

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
).describe(DEFAULT_DISCOUNT_DESCRIPTION)

// Number of payments discounts schema
export const numberOfPaymentsDiscountsInsertSchema =
  baseDiscountSchema.extend(numberOfPaymentsDiscountsRefinements).describe(
    NUMBER_OF_PAYMENTS_DISCOUNT_DESCRIPTION
  )

export const foreverDiscountsInsertSchema = baseDiscountSchema.extend(
  foreverDiscountsRefinements
).describe(FOREVER_DISCOUNT_DESCRIPTION)

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
).describe(DEFAULT_DISCOUNT_DESCRIPTION)

export const numberOfPaymentsDiscountsSelectSchema =
  baseSelectSchema
    .extend(numberOfPaymentsDiscountsRefinements)
    .describe(NUMBER_OF_PAYMENTS_DISCOUNT_DESCRIPTION)

export const foreverDiscountsSelectSchema = baseSelectSchema.extend(
  foreverDiscountsRefinements
).describe(FOREVER_DISCOUNT_DESCRIPTION)

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
  }).describe(DEFAULT_DISCOUNT_DESCRIPTION)

export const numberOfPaymentsDiscountsUpdateSchema =
  numberOfPaymentsDiscountsSelectSchema.partial().extend({
    id: z.string(),
    duration: z.literal(DiscountDuration.NumberOfPayments),
    numberOfPayments: core.safeZodPositiveInteger,
  }).describe(NUMBER_OF_PAYMENTS_DISCOUNT_DESCRIPTION)

export const foreverDiscountsUpdateSchema =
  foreverDiscountsSelectSchema.partial().extend({
    id: z.string(),
    duration: z.literal(DiscountDuration.Forever),
    numberOfPayments: z.null(),
  }).describe(FOREVER_DISCOUNT_DESCRIPTION)

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
  defaultDiscountsInsertSchema.omit(clientWriteOmits).meta({
    id: 'DefaultDiscountInsert',
  }).describe(DEFAULT_DISCOUNT_DESCRIPTION)

export const numberOfPaymentsDiscountClientInsertSchema =
  numberOfPaymentsDiscountsInsertSchema.omit(clientWriteOmits).meta({
    id: 'NumberOfPaymentsDiscountInsert',
  }).describe(NUMBER_OF_PAYMENTS_DISCOUNT_DESCRIPTION)

export const foreverDiscountClientInsertSchema =
  foreverDiscountsInsertSchema.omit(clientWriteOmits).meta({
    id: 'ForeverDiscountInsert',
  }).describe(FOREVER_DISCOUNT_DESCRIPTION)

export const discountClientInsertSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountClientInsertSchema,
    numberOfPaymentsDiscountClientInsertSchema,
    foreverDiscountClientInsertSchema,
  ])
  .meta({
    id: 'DiscountInsert',
  })
  .describe(DISCOUNTS_BASE_DESCRIPTION)

export const defaultDiscountClientUpdateSchema =
  defaultDiscountsUpdateSchema.omit(nonClientEditableColumns).meta({
    id: 'DefaultDiscountUpdate',
  }).describe(DEFAULT_DISCOUNT_DESCRIPTION)

export const numberOfPaymentsDiscountClientUpdateSchema =
  numberOfPaymentsDiscountsUpdateSchema
    .omit(nonClientEditableColumns)
    .meta({
      id: 'NumberOfPaymentsDiscountUpdate',
    }).describe(NUMBER_OF_PAYMENTS_DISCOUNT_DESCRIPTION)

export const foreverDiscountClientUpdateSchema =
  foreverDiscountsUpdateSchema.omit(nonClientEditableColumns).meta({
    id: 'ForeverDiscountUpdate',
  }).describe(FOREVER_DISCOUNT_DESCRIPTION)

export const discountClientUpdateSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountClientUpdateSchema,
    numberOfPaymentsDiscountClientUpdateSchema,
    foreverDiscountClientUpdateSchema,
  ])
  .meta({
    id: 'DiscountUpdate',
  })
  .describe(DISCOUNTS_BASE_DESCRIPTION)

export const defaultDiscountClientSelectSchema =
  defaultDiscountsSelectSchema.omit(hiddenColumns).meta({
    id: 'DefaultDiscountRecord',
  }).describe(DEFAULT_DISCOUNT_DESCRIPTION)

export const numberOfPaymentsDiscountClientSelectSchema =
  numberOfPaymentsDiscountsSelectSchema.omit(hiddenColumns).meta({
    id: 'NumberOfPaymentsDiscountRecord',
  }).describe(NUMBER_OF_PAYMENTS_DISCOUNT_DESCRIPTION)

export const foreverDiscountClientSelectSchema =
  foreverDiscountsSelectSchema.omit(hiddenColumns).meta({
    id: 'ForeverDiscountRecord',
  }).describe(FOREVER_DISCOUNT_DESCRIPTION)

export const discountClientSelectSchema = z
  .discriminatedUnion('duration', [
    foreverDiscountClientSelectSchema,
    numberOfPaymentsDiscountClientSelectSchema,
    defaultDiscountClientSelectSchema,
  ])
  .meta({
    id: 'DiscountRecord',
  })
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

// Form-specific insert schemas separated by amountType intent
const discountFormInsertSchemaFixed = z.discriminatedUnion('duration', [
  defaultDiscountClientInsertSchema.omit({ amount: true }),
  numberOfPaymentsDiscountClientInsertSchema.omit({ amount: true }),
  foreverDiscountClientInsertSchema.omit({ amount: true }),
])

const discountFormInsertSchemaPercent = z.discriminatedUnion('duration', [
  defaultDiscountClientInsertSchema.extend({
    amount: z.number().int().min(1).max(100),
  }),
  numberOfPaymentsDiscountClientInsertSchema.extend({
    amount: z.number().int().min(1).max(100),
  }),
  foreverDiscountClientInsertSchema.extend({
    amount: z.number().int().min(1).max(100),
  }),
])

// Stricter amountType-driven form shape (emulated via union on amountType)
const createFixedFormSchema = z
  .object({
    discount: discountFormInsertSchemaFixed,
    __rawAmountString: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Invalid raw amount string'),
  })
  .superRefine((val, ctx) => {
    if (val.discount.amountType !== DiscountAmountType.Fixed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid form variant for non-fixed discount',
        path: ['discount', 'amountType'],
      })
    }
  })

const createPercentFormSchema = z
  .object({
    discount: discountFormInsertSchemaPercent,
    __rawAmountString: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.discount.amountType !== DiscountAmountType.Percent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid form variant for non-percent discount',
        path: ['discount', 'amountType'],
      })
    }
    if (typeof val.__rawAmountString !== 'undefined') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percent discounts must not include raw amount string',
        path: ['__rawAmountString'],
      })
    }
  })

export const createDiscountFormSchema = z.union([
  createFixedFormSchema,
  createPercentFormSchema,
])

export type CreateDiscountInput = z.infer<
  typeof createDiscountInputSchema
>

export type CreateDiscountFormSchema = z.infer<
  typeof createDiscountFormSchema
>

export const editDiscountInputSchema = z.object({
  discount: discountClientUpdateSchema,
  id: z.string(),
})

// Make nested id/amount optional for form input; server payload will include id
const withOptionalIdAndAmount = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
) =>
  schema.extend({
    id: z.string().optional(),
    amount: z.number().int().min(0).optional(),
  })

const defaultDiscountFormUpdateSchema = withOptionalIdAndAmount(
  defaultDiscountClientUpdateSchema
)

const numberOfPaymentsDiscountFormUpdateSchema = withOptionalIdAndAmount(
  numberOfPaymentsDiscountClientUpdateSchema
)

const foreverDiscountFormUpdateSchema = withOptionalIdAndAmount(
  foreverDiscountClientUpdateSchema
)

// Form-specific update schema: disallow providing amount for Fixed; use __rawAmountString
const discountFormUpdateSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountFormUpdateSchema,
    numberOfPaymentsDiscountFormUpdateSchema,
    foreverDiscountFormUpdateSchema,
  ])
  .superRefine((val: any, ctx: z.RefinementCtx) => {
    if (val.amountType === DiscountAmountType.Fixed) {
      if (val.amount !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Fixed discounts must not provide an amount',
          path: ['amount'],
        })
      }
    } else if (val.amountType === DiscountAmountType.Percent) {
      if (val.amount !== undefined) {
        if (
          !Number.isInteger(val.amount) ||
          val.amount <= 0 ||
          val.amount > 100
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Percent amount must be an integer between 1 and 100',
            path: ['amount'],
          })
        }
      }
    }
  })

const editFixedPayloadSchema = z
  .object({
    discount: discountFormUpdateSchema,
    __rawAmountString: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Invalid raw amount string'),
  })
  .superRefine((val, ctx) => {
    if (val.discount.amountType !== DiscountAmountType.Fixed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid form variant for non-fixed discount',
        path: ['discount', 'amountType'],
      })
    }
    if (typeof (val.discount as any).amount !== 'undefined') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Fixed discounts must not provide an amount',
        path: ['discount', 'amount'],
      })
    }
  })

const editPercentPayloadSchema = z
  .object({
    discount: discountFormUpdateSchema,
    __rawAmountString: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.discount.amountType !== DiscountAmountType.Percent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid form variant for non-percent discount',
        path: ['discount', 'amountType'],
      })
    }
    if (typeof val.__rawAmountString !== 'undefined') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percent discounts must not include raw amount string',
        path: ['__rawAmountString'],
      })
    }
  })

const editBaseSchema = z.object({ id: z.string() })

export const editDiscountFormSchema = editBaseSchema.and(
  z.union([editFixedPayloadSchema, editPercentPayloadSchema])
)

export type EditDiscountInput = z.infer<
  typeof editDiscountInputSchema
>

export type EditDiscountFormSchema = z.infer<
  typeof editDiscountFormSchema
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
