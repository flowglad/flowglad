import * as R from 'ramda'
import {
  integer,
  jsonb,
  pgTable,
  text,
  pgPolicy,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  tableBase,
  notNullStringForeignKey,
  nullableStringForeignKey,
  constructIndex,
  enhancedCreateInsertSchema,
  pgEnumColumn,
  livemodePolicy,
  idInputSchema,
} from '@/db/tableUtils'
import {
  PurchaseSession,
  purchaseSessions,
} from '@/db/schema/purchaseSessions'
import { purchases } from '@/db/schema/purchases'
import { discounts } from '@/db/schema/discounts'
import { organizations } from '@/db/schema/organizations'
import { billingAddressSchema } from '@/db/schema/customers'
import {
  CurrencyCode,
  FeeCalculationType,
  PaymentMethodType,
} from '@/types'
import core, { safeZodNonNegativeInteger } from '@/utils/core'
import { createSelectSchema } from 'drizzle-zod'
import { sql } from 'drizzle-orm'
import { variants } from './variants'
import { billingPeriods } from './billingPeriods'

const TABLE_NAME = 'FeeCalculations'

export const feeCalculations = pgTable(
  TABLE_NAME,
  {
    ...tableBase('feec'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    PurchaseSessionId: nullableStringForeignKey(
      'PurchaseSessionId',
      purchaseSessions
    ),
    purchaseId: nullableStringForeignKey('PurchaseId', purchases),
    discountId: nullableStringForeignKey('discount_id', discounts),
    variantId: nullableStringForeignKey('variant_id', variants),
    paymentMethodType: pgEnumColumn({
      enumName: 'PaymentMethodType',
      columnName: 'paymentMethodType',
      enumBase: PaymentMethodType,
    }).notNull(),
    discountAmountFixed: integer('discountAmountFixed').notNull(),
    paymentMethodFeeFixed: integer('paymentMethodFeeFixed').notNull(),
    baseAmount: integer('baseAmount').notNull(),
    internationalFeePercentage: text(
      'internationalFeePercentage'
    ).notNull(),
    flowgladFeePercentage: text('flowgladFeePercentage').notNull(),
    billingAddress: jsonb('billingAddress').notNull(),
    /**
     * Tax columns
     */
    taxAmountFixed: integer('taxAmountFixed').notNull(),
    pretaxTotal: integer('pretaxTotal').notNull(),
    stripeTaxCalculationId: text('stripeTaxCalculationId'),
    stripeTaxTransactionId: text('stripeTaxTransactionId'),
    billingPeriodId: nullableStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    currency: pgEnumColumn({
      enumName: 'CurrencyCode',
      columnName: 'currency',
      enumBase: CurrencyCode,
    }).notNull(),
    type: pgEnumColumn({
      enumName: 'FeeCalculationType',
      columnName: 'type',
      enumBase: FeeCalculationType,
    }).notNull(),
    internalNotes: text('internalNotes'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.PurchaseSessionId]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructIndex(TABLE_NAME, [table.discountId]),
      livemodePolicy(),
      pgPolicy('Enable select for own organization', {
        as: 'permissive',
        to: 'authenticated',
        for: 'select',
        using: sql`"organizationId" in (select "organizationId" from "Memberships")`,
      }),
    ]
  }
).enableRLS()

const columnRefinements = {
  paymentMethodFeeFixed: safeZodNonNegativeInteger,
  baseAmount: safeZodNonNegativeInteger,
  taxAmountFixed: safeZodNonNegativeInteger,
  pretaxTotal: safeZodNonNegativeInteger,
  discountAmountFixed: safeZodNonNegativeInteger,
  billingAddress: billingAddressSchema.nullable(),
  type: core.createSafeZodEnum(FeeCalculationType),
  currency: core.createSafeZodEnum(CurrencyCode),
}

export const coreFeeCalculationsInsertSchema =
  enhancedCreateInsertSchema(feeCalculations, columnRefinements)

export const coreFeeCalculationsSelectSchema =
  createSelectSchema(feeCalculations).extend(columnRefinements)

const subscriptionFeeCalculationExtension = {
  type: z.literal(FeeCalculationType.SubscriptionPayment),
  PurchaseSessionId: z.null(),
  variantId: z.null(),
}

const purchaseSessionFeeCalculationExtension = {
  type: z.literal(FeeCalculationType.PurchaseSessionPayment),
  billingPeriodId: z.null(),
  variantId: z.string(),
}

export const subscriptionPaymentFeeCalculationInsertSchema =
  coreFeeCalculationsInsertSchema.extend(
    subscriptionFeeCalculationExtension
  )

export const purchaseSessionPaymentFeeCalculationInsertSchema =
  coreFeeCalculationsInsertSchema.extend(
    purchaseSessionFeeCalculationExtension
  )

export const feeCalculationsInsertSchema = z.discriminatedUnion(
  'type',
  [
    subscriptionPaymentFeeCalculationInsertSchema,
    purchaseSessionPaymentFeeCalculationInsertSchema,
  ]
)

export const subscriptionPaymentFeeCalculationSelectSchema =
  coreFeeCalculationsSelectSchema.extend(
    subscriptionFeeCalculationExtension
  )

export const purchaseSessionPaymentFeeCalculationSelectSchema =
  coreFeeCalculationsSelectSchema.extend(
    purchaseSessionFeeCalculationExtension
  )

export const feeCalculationsSelectSchema = z.discriminatedUnion(
  'type',
  [
    subscriptionPaymentFeeCalculationSelectSchema,
    purchaseSessionPaymentFeeCalculationSelectSchema,
  ]
)

export const subscriptionPaymentFeeCalculationUpdateSchema =
  subscriptionPaymentFeeCalculationInsertSchema
    .partial()
    .extend(idInputSchema.shape)
    .extend(subscriptionFeeCalculationExtension)

export const purchaseSessionPaymentFeeCalculationUpdateSchema =
  purchaseSessionPaymentFeeCalculationInsertSchema
    .partial()
    .extend(purchaseSessionFeeCalculationExtension)
    .extend(idInputSchema.shape)

export const feeCalculationsUpdateSchema = z.discriminatedUnion(
  'type',
  [
    subscriptionPaymentFeeCalculationUpdateSchema,
    purchaseSessionPaymentFeeCalculationUpdateSchema,
  ]
)

const readOnlyColumns = {
  organizationId: true,
  PurchaseSessionId: true,
  purchaseId: true,
  livemode: true,
} as const

const hiddenColumns = {
  stripeTaxCalculationId: true,
  stripeTaxTransactionId: true,
  internalNotes: true,
} as const

export const subscriptionFeeCalculationClientSelectSchema =
  subscriptionPaymentFeeCalculationSelectSchema.omit(hiddenColumns)

export const purchaseSessionFeeCalculationClientSelectSchema =
  purchaseSessionPaymentFeeCalculationSelectSchema.omit(hiddenColumns)

export const feeCalculationClientSelectSchema = z.discriminatedUnion(
  'type',
  [
    subscriptionFeeCalculationClientSelectSchema,
    purchaseSessionFeeCalculationClientSelectSchema,
  ]
)

const customerHiddenColumns = {
  flowgladFeePercentage: true,
  internationalFeePercentage: true,
} as const

export const customerFacingPurchaseSessionFeeCalculationSelectSchema =
  purchaseSessionFeeCalculationClientSelectSchema.omit(
    customerHiddenColumns
  )

export const customerFacingSubscriptionFeeCalculationSelectSchema =
  subscriptionFeeCalculationClientSelectSchema.omit(
    customerHiddenColumns
  )

export const customerFacingFeeCalculationSelectSchema =
  z.discriminatedUnion('type', [
    customerFacingSubscriptionFeeCalculationSelectSchema,
    customerFacingPurchaseSessionFeeCalculationSelectSchema,
  ])

export namespace FeeCalculation {
  export type Insert = z.infer<typeof feeCalculationsInsertSchema>
  export type Update = z.infer<typeof feeCalculationsUpdateSchema>
  export type Record = z.infer<typeof feeCalculationsSelectSchema>
  export type ClientRecord = z.infer<
    typeof feeCalculationClientSelectSchema
  >
  export type CustomerRecord = z.infer<
    typeof customerFacingFeeCalculationSelectSchema
  >
}

export const purchaseSessionFeeCalculationParametersChanged = ({
  previousSession,
  currentSession,
}: {
  previousSession: PurchaseSession.Record
  currentSession: PurchaseSession.FeeReadyRecord
}) => {
  const keys = [
    'billingAddress',
    'discountId',
    'variantId',
    'paymentMethodType',
    'quantity',
  ] as const
  return !R.equals(
    R.pick(keys, currentSession),
    R.pick(keys, previousSession)
  )
}
