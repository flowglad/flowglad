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
  createSupabaseWebhookSchema,
  ommittedColumnsForInsertSchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
} from '@/db/tableUtils'
import {
  CheckoutSession,
  checkoutSessions,
} from '@/db/schema/checkoutSessions'
import { purchases } from '@/db/schema/purchases'
import { discounts } from '@/db/schema/discounts'
import { organizations } from '@/db/schema/organizations'
import { billingAddressSchema } from '@/db/schema/organizations'
import {
  CurrencyCode,
  FeeCalculationType,
  PaymentMethodType,
} from '@/types'
import core, { safeZodNonNegativeInteger } from '@/utils/core'
import { createSelectSchema } from 'drizzle-zod'
import { sql } from 'drizzle-orm'
import { prices } from './prices'
import { billingPeriods } from './billingPeriods'

const TABLE_NAME = 'fee_calculations'

// Schema descriptions
const FEE_CALCULATIONS_BASE_DESCRIPTION =
  'A fee calculation record, which describes the fees and taxes associated with a payment. Each calculation has a specific type that determines its behavior and required fields.'

export const feeCalculations = pgTable(
  TABLE_NAME,
  {
    ...tableBase('feec'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    checkoutSessionId: nullableStringForeignKey(
      'checkout_session_id',
      checkoutSessions
    ),
    purchaseId: nullableStringForeignKey('purchase_id', purchases),
    discountId: nullableStringForeignKey('discount_id', discounts),
    priceId: nullableStringForeignKey('price_id', prices),
    paymentMethodType: pgEnumColumn({
      enumName: 'PaymentMethodType',
      columnName: 'payment_method_type',
      enumBase: PaymentMethodType,
    }).notNull(),
    discountAmountFixed: integer('discount_amount_fixed').notNull(),
    paymentMethodFeeFixed: integer(
      'payment_method_fee_fixed'
    ).notNull(),
    baseAmount: integer('base_amount').notNull(),
    internationalFeePercentage: text(
      'international_fee_percentage'
    ).notNull(),
    flowgladFeePercentage: text('flowglad_fee_percentage').notNull(),
    billingAddress: jsonb('billing_address').notNull(),
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
      constructIndex(TABLE_NAME, [table.checkoutSessionId]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructIndex(TABLE_NAME, [table.discountId]),
      livemodePolicy(),
      pgPolicy('Enable select for own organization', {
        as: 'permissive',
        to: 'authenticated',
        for: 'select',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
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
  checkoutSessionId: z.null(),
  priceId: z.null(),
}

const checkoutSessionFeeCalculationExtension = {
  type: z.literal(FeeCalculationType.CheckoutSessionPayment),
  billingPeriodId: z.null(),
  priceId: z.string(),
}

const SUBSCRIPTION_FEE_CALCULATION_DESCRIPTION =
  'A fee calculation for a subscription, which should always have an associated billingPeriodId.'

const CHECKOUT_SESSION_FEE_CALCULATION_DESCRIPTION =
  'A fee calculation for a checkoutSession, which should always have a checkoutSessionId.'

export const subscriptionPaymentFeeCalculationInsertSchema =
  coreFeeCalculationsInsertSchema
    .extend(subscriptionFeeCalculationExtension)
    .describe(SUBSCRIPTION_FEE_CALCULATION_DESCRIPTION)

export const checkoutSessionPaymentFeeCalculationInsertSchema =
  coreFeeCalculationsInsertSchema
    .extend(checkoutSessionFeeCalculationExtension)
    .describe(CHECKOUT_SESSION_FEE_CALCULATION_DESCRIPTION)

export const feeCalculationsInsertSchema = z
  .discriminatedUnion('type', [
    subscriptionPaymentFeeCalculationInsertSchema,
    checkoutSessionPaymentFeeCalculationInsertSchema,
  ])
  .describe(FEE_CALCULATIONS_BASE_DESCRIPTION)

export const subscriptionPaymentFeeCalculationSelectSchema =
  coreFeeCalculationsSelectSchema
    .extend(subscriptionFeeCalculationExtension)
    .describe(SUBSCRIPTION_FEE_CALCULATION_DESCRIPTION)

export const checkoutSessionPaymentFeeCalculationSelectSchema =
  coreFeeCalculationsSelectSchema
    .extend(checkoutSessionFeeCalculationExtension)
    .describe(CHECKOUT_SESSION_FEE_CALCULATION_DESCRIPTION)

export const feeCalculationsSelectSchema = z
  .discriminatedUnion('type', [
    subscriptionPaymentFeeCalculationSelectSchema,
    checkoutSessionPaymentFeeCalculationSelectSchema,
  ])
  .describe(FEE_CALCULATIONS_BASE_DESCRIPTION)

export const subscriptionPaymentFeeCalculationUpdateSchema =
  subscriptionPaymentFeeCalculationInsertSchema
    .partial()
    .extend(idInputSchema.shape)
    .extend(subscriptionFeeCalculationExtension)
    .describe(SUBSCRIPTION_FEE_CALCULATION_DESCRIPTION)

export const checkoutSessionPaymentFeeCalculationUpdateSchema =
  checkoutSessionPaymentFeeCalculationInsertSchema
    .partial()
    .extend(checkoutSessionFeeCalculationExtension)
    .extend(idInputSchema.shape)
    .describe(CHECKOUT_SESSION_FEE_CALCULATION_DESCRIPTION)

export const feeCalculationsUpdateSchema = z
  .discriminatedUnion('type', [
    subscriptionPaymentFeeCalculationUpdateSchema,
    checkoutSessionPaymentFeeCalculationUpdateSchema,
  ])
  .describe(FEE_CALCULATIONS_BASE_DESCRIPTION)

const readOnlyColumns = {
  organizationId: true,
  checkoutSessionId: true,
  purchaseId: true,
  livemode: true,
} as const

const hiddenColumns = {
  stripeTaxCalculationId: true,
  stripeTaxTransactionId: true,
  internalNotes: true,
  createdByCommit: true,
  updatedByCommit: true,
  ...hiddenColumnsForClientSchema,
} as const

export const subscriptionFeeCalculationClientSelectSchema =
  subscriptionPaymentFeeCalculationSelectSchema.omit(hiddenColumns)

export const checkoutSessionFeeCalculationClientSelectSchema =
  checkoutSessionPaymentFeeCalculationSelectSchema.omit(hiddenColumns)

export const feeCalculationClientSelectSchema = z
  .discriminatedUnion('type', [
    subscriptionPaymentFeeCalculationSelectSchema,
    checkoutSessionPaymentFeeCalculationSelectSchema,
  ])
  .describe(FEE_CALCULATIONS_BASE_DESCRIPTION)

const customerHiddenColumns = {
  flowgladFeePercentage: true,
  internationalFeePercentage: true,
} as const

export const customerFacingCheckoutSessionFeeCalculationSelectSchema =
  checkoutSessionFeeCalculationClientSelectSchema.omit(
    customerHiddenColumns
  )

export const customerFacingSubscriptionFeeCalculationSelectSchema =
  subscriptionFeeCalculationClientSelectSchema.omit(
    customerHiddenColumns
  )

export const customerFacingFeeCalculationSelectSchema =
  z.discriminatedUnion('type', [
    customerFacingSubscriptionFeeCalculationSelectSchema,
    customerFacingCheckoutSessionFeeCalculationSelectSchema,
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
  export type Where = SelectConditions<typeof feeCalculations>
}

export const checkoutSessionFeeCalculationParametersChanged = ({
  previousSession,
  currentSession,
}: {
  previousSession: CheckoutSession.Record
  currentSession: CheckoutSession.FeeReadyRecord
}) => {
  const keys = [
    'billingAddress',
    'discountId',
    'priceId',
    'paymentMethodType',
    'quantity',
  ] as const
  return !R.equals(
    R.pick(keys, currentSession),
    R.pick(keys, previousSession)
  )
}
