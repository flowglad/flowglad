import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { currencyCodeSchema } from '../commonZodSchema'
import { buildSchemas } from '../createZodSchemas'
import {
  CurrencyCode,
  PaymentMethodType,
  PaymentStatus,
  RevenueChartIntervalUnit,
} from '../enums'
import {
  constructIndex,
  constructUniqueIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  ommittedColumnsForInsertSchema,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  taxColumns,
  taxSchemaColumns,
  timestampWithTimezoneColumn,
} from '../tableUtils'
import { zodEpochMs } from '../timestampMs'
import core, { zodOptionalNullableString } from '../utils'
import { billingPeriods } from './billingPeriods'
import { customerClientSelectSchema, customers } from './customers'
import { invoices } from './invoices'
import { organizations } from './organizations'
import { paymentMethods } from './paymentMethods'
import { pricingModels } from './pricingModels'
import { purchases } from './purchases'
import { subscriptions } from './subscriptions'

export const TABLE_NAME = 'payments'

export const payments = pgTable(
  TABLE_NAME,
  {
    ...tableBase('pym'),
    invoiceId: notNullStringForeignKey('invoice_id', invoices),
    amount: integer('amount').notNull(),
    paymentMethod: pgEnumColumn({
      enumName: 'PaymentMethod',
      columnName: 'payment_method',
      enumBase: PaymentMethodType,
    }).notNull(),
    currency: pgEnumColumn({
      enumName: 'Currency',
      columnName: 'currency',
      enumBase: CurrencyCode,
    }).notNull(),
    status: pgEnumColumn({
      enumName: 'PaymentStatus',
      columnName: 'status',
      enumBase: PaymentStatus,
    }).notNull(),
    chargeDate: timestampWithTimezoneColumn('charge_date').notNull(),
    settlementDate: timestampWithTimezoneColumn('settlement_date'),
    description: text('description'),
    receiptNumber: text('receipt_number'),
    receiptURL: text('receipt_url'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    customerId: notNullStringForeignKey('customer_id', customers),
    purchaseId: nullableStringForeignKey('purchase_id', purchases),
    subscriptionId: nullableStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    paymentMethodId: nullableStringForeignKey(
      'payment_method_id',
      paymentMethods
    ),
    billingPeriodId: nullableStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    stripePaymentIntentId: text('stripe_payment_intent_id').notNull(),
    stripeChargeId: text('stripe_charge_id'),
    ...taxColumns(),
    /**
     * Refund columns
     */
    refunded: boolean('refunded').notNull().default(false),
    refundedAmount: integer('refunded_amount'),
    refundedAt: timestampWithTimezoneColumn('refunded_at'),
    failureMessage: text('failure_message'),
    failureCode: text('failure_code'),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.invoiceId]),
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.paymentMethod]),
    constructIndex(TABLE_NAME, [table.customerId]),
    constructIndex(TABLE_NAME, [table.status]),
    constructIndex(TABLE_NAME, [table.currency]),
    constructIndex(TABLE_NAME, [table.purchaseId]),
    constructUniqueIndex(TABLE_NAME, [table.stripeChargeId]),
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"customer_id" in (select "id" from "customers")`,
      }
    ),
    merchantPolicy('Enable select for own organization', {
      as: 'permissive',
      to: 'merchant',
      for: 'select',
      using: orgIdEqualsCurrentSQL(),
    }),
    merchantPolicy('Enable update for own organization', {
      as: 'permissive',
      to: 'merchant',
      for: 'update',
      using: orgIdEqualsCurrentSQL(),
    }),
  ])
).enableRLS()

const columnEnhancements = {
  amount: core.safeZodPositiveIntegerOrZero,
  status: core.createSafeZodEnum(PaymentStatus),
  currency: currencyCodeSchema,
  paymentMethod: core.createSafeZodEnum(PaymentMethodType),
  receiptNumber: zodOptionalNullableString,
  receiptURL: z.url().nullable().optional(),
  ...taxSchemaColumns,
  taxType: taxSchemaColumns.taxType.nullable().optional(),
  taxCountry: taxSchemaColumns.taxCountry.nullable().optional(),
}

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
  pricingModelId: true,
} as const

const hiddenColumns = {
  stripePaymentIntentId: true,
  stripeTaxCalculationId: true,
  stripeTaxTransactionId: true,
  stripeChargeId: true,
  ...hiddenColumnsForClientSchema,
} as const

export const {
  select: paymentsSelectSchema,
  insert: paymentsInsertSchema,
  update: paymentsUpdateSchema,
  client: { select: paymentsClientSelectSchema },
} = buildSchemas(payments, {
  refine: columnEnhancements,
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
  },
  entityName: 'Payment',
})

export const paymentsTableRowDataSchema = z.object({
  payment: paymentsClientSelectSchema,
  customer: customerClientSelectSchema,
})

export const paymentsPaginatedTableRowDataSchema = z.object({
  payment: paymentsClientSelectSchema,
  customer: customerClientSelectSchema,
})

export const paymentsPaginatedListSchema =
  createPaginatedListQuerySchema(paymentsClientSelectSchema)

export namespace Payment {
  export type Insert = z.infer<typeof paymentsInsertSchema>
  export type Update = z.infer<typeof paymentsUpdateSchema>
  export type Record = z.infer<typeof paymentsSelectSchema>
  export type ClientRecord = z.infer<
    typeof paymentsClientSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof paymentsPaginatedListSchema
  >
  export type TableRowData = z.infer<
    typeof paymentsTableRowDataSchema
  >
  export type Where = SelectConditions<typeof payments>
}

export const getRevenueDataInputSchema = z.object({
  organizationId: z.string(),
  revenueChartIntervalUnit: core.createSafeZodEnum(
    RevenueChartIntervalUnit
  ),
  productId: z.string().nullish(),
  fromDate: zodEpochMs,
  toDate: zodEpochMs,
})

export type GetRevenueDataInput = z.infer<
  typeof getRevenueDataInputSchema
>

export type RevenueDataItem = {
  date: Date
  revenue: number
}

export const refundPaymentInputSchema = z.object({
  id: z.string(),
  partialAmount: z
    .number()
    .optional()
    .describe(
      'The amount to refund. If not provided, the entire amount will be refunded. Cannot exceed the amount of the associated payment.'
    ),
})

export type RefundPaymentInput = z.infer<
  typeof refundPaymentInputSchema
>

export const paymentsPaginatedSelectSchema =
  createPaginatedSelectSchema(
    paymentsClientSelectSchema.pick({
      status: true,
      customerId: true,
    })
  )
