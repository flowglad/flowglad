import {
  pgTable,
  integer,
  text,
  boolean,
  timestamp,
  pgPolicy,
} from 'drizzle-orm/pg-core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { z } from 'zod'
import {
  ommittedColumnsForInsertSchema,
  pgEnumColumn,
  taxColumns,
  taxSchemaColumns,
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  constructUniqueIndex,
  nullableStringForeignKey,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  enableCustomerReadPolicy,
  timestampWithTimezoneColumn,
  zodEpochMs,
} from '@/db/tableUtils'
import { invoices } from './invoices'
import { organizations } from './organizations'
import {
  PaymentMethodType,
  PaymentStatus,
  CurrencyCode,
  RevenueChartIntervalUnit,
} from '@/types'
import core, { zodOptionalNullableString } from '@/utils/core'
import { purchases } from './purchases'
import { customerClientSelectSchema, customers } from './customers'
import { sql } from 'drizzle-orm'
import { paymentMethods } from './paymentMethods'
import { billingPeriods } from './billingPeriods'
import { subscriptions } from './subscriptions'
import { currencyCodeSchema } from '@/db/commonZodSchema'
import { buildSchemas } from '../createZodSchemas'

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
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.invoiceId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.paymentMethod]),
      constructIndex(TABLE_NAME, [table.customerId]),
      constructIndex(TABLE_NAME, [table.status]),
      constructIndex(TABLE_NAME, [table.currency]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructUniqueIndex(TABLE_NAME, [table.stripeChargeId]),
      constructIndex(TABLE_NAME, [table.subscriptionId]),
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
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }),
      merchantPolicy('Enable update for own organization', {
        as: 'permissive',
        to: 'merchant',
        for: 'update',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

const columnEnhancements = {
  amount: core.safeZodPositiveIntegerOrZero,
  status: core.createSafeZodEnum(PaymentStatus),
  currency: currencyCodeSchema,
  settlementDate: zodEpochMs.nullable().optional(),
  refundedAt: zodEpochMs.nullable().optional(),
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
