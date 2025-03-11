import {
  pgTable,
  integer,
  text,
  boolean,
  timestamp,
  pgPolicy,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import {
  enhancedCreateInsertSchema,
  pgEnumColumn,
  taxColumns,
  taxSchemaColumns,
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  constructUniqueIndex,
  createUpdateSchema,
  nullableStringForeignKey,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
} from '@/db/tableUtils'
import { invoices } from './invoices'
import { organizations } from './organizations'
import {
  PaymentMethodType,
  PaymentStatus,
  CurrencyCode,
  RevenueChartIntervalUnit,
} from '@/types'
import core from '@/utils/core'
import { purchases } from './purchases'
import {
  customerProfileClientSelectSchema,
  customerProfiles,
} from './customerProfiles'
import { sql } from 'drizzle-orm'
import { paymentMethods } from './paymentMethods'
import { billingPeriods } from './billingPeriods'

export const TABLE_NAME = 'Payments'

export const payments = pgTable(
  TABLE_NAME,
  {
    ...tableBase('pym'),
    InvoiceId: notNullStringForeignKey('InvoiceId', invoices),
    amount: integer('amount').notNull(),
    paymentMethod: pgEnumColumn({
      enumName: 'PaymentMethod',
      columnName: 'paymentMethod',
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
    chargeDate: timestamp('chargeDate').notNull(),
    settlementDate: timestamp('settlementDate'),
    description: text('description'),
    receiptNumber: text('receiptNumber'),
    receiptURL: text('receiptURL'),
    OrganizationId: notNullStringForeignKey(
      'OrganizationId',
      organizations
    ),
    CustomerProfileId: notNullStringForeignKey(
      'CustomerProfileId',
      customerProfiles
    ),
    PurchaseId: nullableStringForeignKey('PurchaseId', purchases),
    PaymentMethodId: nullableStringForeignKey(
      'PaymentMethodId',
      paymentMethods
    ),
    BillingPeriodId: nullableStringForeignKey(
      'BillingPeriodId',
      billingPeriods
    ),
    stripePaymentIntentId: text('stripePaymentIntentId').notNull(),
    stripeChargeId: text('stripeChargeId'),
    ...taxColumns(),
    /**
     * Refund columns
     */
    refunded: boolean('refunded').notNull().default(false),
    refundedAmount: integer('refundedAmount'),
    refundedAt: timestamp('refundedAt'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.InvoiceId]),
      constructIndex(TABLE_NAME, [table.OrganizationId]),
      constructIndex(TABLE_NAME, [table.paymentMethod]),
      constructIndex(TABLE_NAME, [table.CustomerProfileId]),
      constructIndex(TABLE_NAME, [table.status]),
      constructIndex(TABLE_NAME, [table.currency]),
      constructIndex(TABLE_NAME, [table.PurchaseId]),
      constructUniqueIndex(TABLE_NAME, [table.stripeChargeId]),
      pgPolicy('Enable select for own organization', {
        as: 'permissive',
        to: 'authenticated',
        for: 'select',
        using: sql`"OrganizationId" in (select "OrganizationId" from "Memberships")`,
      }),
      pgPolicy('Enable update for own organization', {
        as: 'permissive',
        to: 'authenticated',
        for: 'update',
        using: sql`"OrganizationId" in (select "OrganizationId" from "Memberships")`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnEnhancements = {
  amount: core.safeZodPositiveIntegerOrZero,
  status: core.createSafeZodEnum(PaymentStatus),
  currency: core.createSafeZodEnum(CurrencyCode),
  chargeDate: core.safeZodDate,
  settlementDate: core.safeZodDate.nullable(),
  refundedAt: core.safeZodDate.nullable(),
  paymentMethod: core.createSafeZodEnum(PaymentMethodType),
  receiptNumber: z.string().nullable(),
  receiptURL: z.string().url().nullable(),
  ...taxSchemaColumns,
}

export const paymentsSelectSchema = createSelectSchema(
  payments
).extend(columnEnhancements)

export const paymentsInsertSchema = enhancedCreateInsertSchema(
  payments,
  columnEnhancements
)

export const paymentsUpdateSchema = createUpdateSchema(
  payments,
  columnEnhancements
)

const readonlyColumns = {
  OrganizationId: true,
  livemode: true,
} as const

const hiddenColumns = {
  stripePaymentIntentId: true,
  stripeTaxCalculationId: true,
  stripeTaxTransactionId: true,
} as const

export const paymentsClientSelectSchema = paymentsSelectSchema
  .omit(hiddenColumns)
  .omit(readonlyColumns)

export const paymentsTableRowDataSchema = z.object({
  payment: paymentsClientSelectSchema,
  customerProfile: customerProfileClientSelectSchema,
})

export const paymentsPaginatedListSchema =
  createPaginatedListQuerySchema<
    z.infer<typeof paymentsClientSelectSchema>
  >(paymentsClientSelectSchema)

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
}

export const getRevenueDataInputSchema = z.object({
  OrganizationId: z.string(),
  revenueChartIntervalUnit: core.createSafeZodEnum(
    RevenueChartIntervalUnit
  ),
  ProductId: z.string().nullish(),
  fromDate: core.safeZodDate,
  toDate: core.safeZodDate,
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
  partialAmount: z.number().nullable(),
})

export type RefundPaymentInput = z.infer<
  typeof refundPaymentInputSchema
>

export const paymentsPaginatedSelectSchema =
  createPaginatedSelectSchema(
    paymentsClientSelectSchema.pick({
      status: true,
      CustomerProfileId: true,
    })
  )
