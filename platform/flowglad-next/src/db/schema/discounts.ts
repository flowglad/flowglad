import { sql } from 'drizzle-orm'
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { organizations } from '@/db/schema/organizations'
import {
  constructIndex,
  constructUniqueIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  createSupabaseWebhookSchema,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'
import { DiscountAmountType, DiscountDuration } from '@/types'
import core from '@/utils/core'

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
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.code]),
    constructUniqueIndex(TABLE_NAME, [
      table.code,
      table.organizationId,
      table.livemode,
    ]),
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
        using: orgIdEqualsCurrentSQL(),
      }
    ),
  ])
).enableRLS()

const columnRefinements = {
  amount: core.safeZodPositiveInteger,
  amountType: core.createSafeZodEnum(DiscountAmountType),
  duration: core.createSafeZodEnum(DiscountDuration),
  numberOfPayments: core.safeZodPositiveInteger.nullable(),
  code: z
    .string()
    .transform((code) => code.toUpperCase())
    .pipe(z.string().min(3).max(20))
    .meta({
      description:
        'The discount code, must be unique and between 3 and 20 characters.',
    }),
}

// Per-variant refinements for discriminator 'duration'
const defaultDiscountsRefinements = {
  duration: z.literal(DiscountDuration.Once),
  numberOfPayments: z.null().optional(),
}

const foreverDiscountsRefinements = {
  duration: z.literal(DiscountDuration.Forever),
  numberOfPayments: z.null().optional(),
}

const numberOfPaymentsDiscountsRefinements = {
  duration: z.literal(DiscountDuration.NumberOfPayments),
  numberOfPayments: core.safeZodPositiveInteger,
}

// Build per-variant schemas using shared builder

export const {
  insert: defaultDiscountsInsertSchema,
  select: defaultDiscountsSelectSchema,
  update: defaultDiscountsUpdateSchema,
  client: {
    insert: defaultDiscountClientInsertSchema,
    select: defaultDiscountClientSelectSchema,
    update: defaultDiscountClientUpdateSchema,
  },
} = buildSchemas(discounts, {
  discriminator: 'duration',
  refine: { ...columnRefinements, ...defaultDiscountsRefinements },
  entityName: 'DefaultDiscount',
})

export const {
  insert: numberOfPaymentsDiscountsInsertSchema,
  select: numberOfPaymentsDiscountsSelectSchema,
  update: numberOfPaymentsDiscountsUpdateSchema,
  client: {
    insert: numberOfPaymentsDiscountClientInsertSchema,
    select: numberOfPaymentsDiscountClientSelectSchema,
    update: numberOfPaymentsDiscountClientUpdateSchema,
  },
} = buildSchemas(discounts, {
  discriminator: 'duration',
  refine: {
    ...columnRefinements,
    ...numberOfPaymentsDiscountsRefinements,
  },
  entityName: 'NumberOfPaymentsDiscount',
})

export const {
  insert: foreverDiscountsInsertSchema,
  select: foreverDiscountsSelectSchema,
  update: foreverDiscountsUpdateSchema,
  client: {
    insert: foreverDiscountClientInsertSchema,
    select: foreverDiscountClientSelectSchema,
    update: foreverDiscountClientUpdateSchema,
  },
} = buildSchemas(discounts, {
  discriminator: 'duration',
  refine: { ...columnRefinements, ...foreverDiscountsRefinements },
  entityName: 'ForeverDiscount',
})

const supabaseSchemas = createSupabaseWebhookSchema({
  table: discounts,
  tableName: TABLE_NAME,
  refine: columnRefinements,
})

export const discountsSupabaseInsertPayloadSchema =
  supabaseSchemas.supabaseInsertPayloadSchema
export const discountsSupabaseUpdatePayloadSchema =
  supabaseSchemas.supabaseUpdatePayloadSchema

// Variant insert schemas created by builder above

// Combined insert schema
export const discountsInsertSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountsInsertSchema,
    numberOfPaymentsDiscountsInsertSchema,
    foreverDiscountsInsertSchema,
  ])
  .describe(DISCOUNTS_BASE_DESCRIPTION)

// Variant select schemas created by builder above

export const discountsSelectSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountsSelectSchema,
    numberOfPaymentsDiscountsSelectSchema,
    foreverDiscountsSelectSchema,
  ])
  .describe(DISCOUNTS_BASE_DESCRIPTION)

// Variant update schemas created by builder above

export const discountsUpdateSchema = z
  .discriminatedUnion('duration', [
    defaultDiscountsUpdateSchema,
    numberOfPaymentsDiscountsUpdateSchema,
    foreverDiscountsUpdateSchema,
  ])
  .describe(DISCOUNTS_BASE_DESCRIPTION)

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

export const discountWithRedemptionsSchema =
  discountClientSelectSchema.and(
    z.object({
      redemptionCount: z.number(),
    })
  )

export const discountsPaginatedListWithRedemptionsSchema =
  createPaginatedListQuerySchema(discountWithRedemptionsSchema)

export const discountsTableRowDataSchema = z.object({
  discount: discountClientSelectSchema,
  redemptionCount: z.number(),
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
const discountFormInsertSchemaFixed = z.discriminatedUnion(
  'duration',
  [
    defaultDiscountClientInsertSchema.omit({ amount: true }),
    numberOfPaymentsDiscountClientInsertSchema.omit({ amount: true }),
    foreverDiscountClientInsertSchema.omit({ amount: true }),
  ]
)

const discountFormInsertSchemaPercent = z.discriminatedUnion(
  'duration',
  [
    defaultDiscountClientInsertSchema.extend({
      amount: z.number().int().min(1).max(100),
    }),
    numberOfPaymentsDiscountClientInsertSchema.extend({
      amount: z.number().int().min(1).max(100),
    }),
    foreverDiscountClientInsertSchema.extend({
      amount: z.number().int().min(1).max(100),
    }),
  ]
)

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
        message:
          'Percent discounts must not include raw amount string',
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

const numberOfPaymentsDiscountFormUpdateSchema =
  withOptionalIdAndAmount(numberOfPaymentsDiscountClientUpdateSchema)

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
            message:
              'Percent amount must be an integer between 1 and 100',
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
        message:
          'Percent discounts must not include raw amount string',
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
