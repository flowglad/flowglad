import { sql } from 'drizzle-orm'
import {
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import { currencyCodeSchema } from '@/db/commonZodSchema'
import {
  type CheckoutSession,
  checkoutSessions,
} from '@/db/schema/checkoutSessions'
import { discounts } from '@/db/schema/discounts'
import {
  billingAddressSchema,
  organizations,
} from '@/db/schema/organizations'
import { purchases } from '@/db/schema/purchases'
import {
  constructIndex,
  createSupabaseWebhookSchema,
  hiddenColumnsForClientSchema,
  idInputSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  ommittedColumnsForInsertSchema,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'
import {
  CurrencyCode,
  FeeCalculationType,
  PaymentMethodType,
} from '@/types'
import core, { safeZodNonNegativeInteger } from '@/utils/core'
import { buildSchemas } from '../createZodSchemas'
import { billingPeriods } from './billingPeriods'
import { prices } from './prices'
import { pricingModels } from './pricingModels'

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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
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
    morSurchargePercentage: text('mor_surcharge_percentage')
      .notNull()
      .default('0'),
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
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    constructIndex(TABLE_NAME, [table.checkoutSessionId]),
    constructIndex(TABLE_NAME, [table.purchaseId]),
    constructIndex(TABLE_NAME, [table.discountId]),
    merchantPolicy('Enable select for own organization', {
      as: 'permissive',
      to: 'merchant',
      for: 'select',
      using: orgIdEqualsCurrentSQL(),
    }),
  ])
).enableRLS()

const columnRefinements = {
  paymentMethodFeeFixed: safeZodNonNegativeInteger,
  baseAmount: safeZodNonNegativeInteger,
  taxAmountFixed: safeZodNonNegativeInteger,
  pretaxTotal: safeZodNonNegativeInteger,
  discountAmountFixed: safeZodNonNegativeInteger,
  billingAddress: billingAddressSchema,
  type: core.createSafeZodEnum(FeeCalculationType),
  currency: currencyCodeSchema,
}

export const coreFeeCalculationsInsertSchema = createInsertSchema(
  feeCalculations
)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)

export const coreFeeCalculationsSelectSchema =
  createSelectSchema(feeCalculations).extend(columnRefinements)

const subscriptionFeeCalculationExtension = {
  type: z.literal(FeeCalculationType.SubscriptionPayment),
  checkoutSessionId: z.null().optional(),
  priceId: z.null().optional(),
}

const readOnlyColumns = {
  organizationId: true,
  pricingModelId: true,
  checkoutSessionId: true,
  purchaseId: true,
  livemode: true,
} as const

const hiddenColumns = {
  stripeTaxCalculationId: true,
  stripeTaxTransactionId: true,
  internalNotes: true,
  ...hiddenColumnsForClientSchema,
} as const

export const {
  select: subscriptionPaymentFeeCalculationSelectSchema,
  insert: subscriptionPaymentFeeCalculationInsertSchema,
  update: subscriptionPaymentFeeCalculationUpdateSchema,
  client: {
    select: subscriptionPaymentFeeCalculationClientSelectSchema,
    insert: subscriptionPaymentFeeCalculationClientInsertSchema,
    update: subscriptionPaymentFeeCalculationClientUpdateSchema,
  },
} = buildSchemas(feeCalculations, {
  discriminator: 'type',
  refine: {
    ...columnRefinements,
    ...subscriptionFeeCalculationExtension,
    type: z.literal(FeeCalculationType.SubscriptionPayment),
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
  },
  entityName: 'SubscriptionFeeCalculation',
})

const checkoutSessionFeeCalculationExtension = {
  type: z.literal(FeeCalculationType.CheckoutSessionPayment),
  billingPeriodId: z.null().optional(),
}

export const {
  select: checkoutSessionPaymentFeeCalculationSelectSchema,
  insert: checkoutSessionPaymentFeeCalculationInsertSchema,
  update: checkoutSessionPaymentFeeCalculationUpdateSchema,
  client: {
    select: checkoutSessionPaymentFeeCalculationClientSelectSchema,
    insert: checkoutSessionPaymentFeeCalculationClientInsertSchema,
    update: checkoutSessionPaymentFeeCalculationClientUpdateSchema,
  },
} = buildSchemas(feeCalculations, {
  discriminator: 'type',
  refine: {
    ...columnRefinements,
    ...checkoutSessionFeeCalculationExtension,
    type: z.literal(FeeCalculationType.CheckoutSessionPayment),
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
  },
  entityName: 'CheckoutSessionFeeCalculation',
})

const SUBSCRIPTION_FEE_CALCULATION_DESCRIPTION =
  'A fee calculation for a subscription, which should always have an associated billingPeriodId.'

const CHECKOUT_SESSION_FEE_CALCULATION_DESCRIPTION =
  'A fee calculation for a checkoutSession, which should always have a checkoutSessionId.'

export const feeCalculationsInsertSchema = z
  .discriminatedUnion('type', [
    subscriptionPaymentFeeCalculationInsertSchema,
    checkoutSessionPaymentFeeCalculationInsertSchema,
  ])
  .describe(FEE_CALCULATIONS_BASE_DESCRIPTION)

export const feeCalculationsSelectSchema = z
  .discriminatedUnion('type', [
    subscriptionPaymentFeeCalculationSelectSchema,
    checkoutSessionPaymentFeeCalculationSelectSchema,
  ])
  .describe(FEE_CALCULATIONS_BASE_DESCRIPTION)

export const feeCalculationsUpdateSchema = z
  .discriminatedUnion('type', [
    subscriptionPaymentFeeCalculationUpdateSchema,
    checkoutSessionPaymentFeeCalculationUpdateSchema,
  ])
  .describe(FEE_CALCULATIONS_BASE_DESCRIPTION)

export const feeCalculationClientSelectSchema = z
  .discriminatedUnion('type', [
    subscriptionPaymentFeeCalculationClientSelectSchema,
    checkoutSessionPaymentFeeCalculationClientSelectSchema,
  ])
  .meta({
    id: 'FeeCalculationRecord',
  })
  .describe(FEE_CALCULATIONS_BASE_DESCRIPTION)

const customerHiddenColumns = {
  flowgladFeePercentage: true,
  morSurchargePercentage: true,
  internationalFeePercentage: true,
} as const

export const customerFacingCheckoutSessionFeeCalculationSelectSchema =
  checkoutSessionPaymentFeeCalculationClientSelectSchema
    .omit(customerHiddenColumns)
    .meta({
      id: 'CustomerCheckoutSessionFeeCalculationRecord',
    })

export const customerFacingSubscriptionFeeCalculationSelectSchema =
  subscriptionPaymentFeeCalculationClientSelectSchema
    .omit(customerHiddenColumns)
    .meta({
      id: 'CustomerSubscriptionFeeCalculationRecord',
    })

export const customerFacingFeeCalculationSelectSchema = z
  .discriminatedUnion('type', [
    customerFacingSubscriptionFeeCalculationSelectSchema,
    customerFacingCheckoutSessionFeeCalculationSelectSchema,
  ])
  .meta({
    id: 'CustomerFeeCalculationRecord',
  })

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

  // --- Specific subtypes ---
  /** Insert types for discriminated schemas */
  export type SubscriptionInsert = z.infer<
    typeof subscriptionPaymentFeeCalculationInsertSchema
  >
  export type CheckoutSessionInsert = z.infer<
    typeof checkoutSessionPaymentFeeCalculationInsertSchema
  >

  /** Update types for each fee calculation kind */
  export type SubscriptionUpdate = z.infer<
    typeof subscriptionPaymentFeeCalculationUpdateSchema
  >
  export type CheckoutSessionUpdate = z.infer<
    typeof checkoutSessionPaymentFeeCalculationUpdateSchema
  >

  /** Record types as selected by schemas */
  export type SubscriptionRecord = z.infer<
    typeof subscriptionPaymentFeeCalculationSelectSchema
  >
  export type CheckoutSessionRecord = z.infer<
    typeof checkoutSessionPaymentFeeCalculationSelectSchema
  >

  /** ClientRecord types omitting hidden fields */
  export type SubscriptionClientRecord = z.infer<
    typeof subscriptionPaymentFeeCalculationClientSelectSchema
  >
  export type CheckoutSessionClientRecord = z.infer<
    typeof checkoutSessionPaymentFeeCalculationClientSelectSchema
  >

  /** Customer-facing records with sensitive fields omitted */
  export type SubscriptionCustomerRecord = z.infer<
    typeof customerFacingSubscriptionFeeCalculationSelectSchema
  >
  export type CheckoutSessionCustomerRecord = z.infer<
    typeof customerFacingCheckoutSessionFeeCalculationSelectSchema
  >
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
