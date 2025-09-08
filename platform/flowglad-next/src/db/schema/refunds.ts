import {
  boolean,
  text,
  pgTable,
  pgPolicy,
  timestamp,
  integer,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  livemodePolicy,
  pgEnumColumn,
  nullableStringForeignKey,
  ommittedColumnsForInsertSchema,
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { payments } from '@/db/schema/payments'
import { subscriptions } from '@/db/schema/subscriptions'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import core from '@/utils/core'
import { CurrencyCode, RefundStatus } from '@/types'
import { currencyCodeSchema } from '@/db/commonZodSchema'

const TABLE_NAME = 'refunds'

export const refunds = pgTable(
  TABLE_NAME,
  {
    ...tableBase('refund'),
    paymentId: notNullStringForeignKey('payment_id', payments),
    subscriptionId: nullableStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    amount: integer('amount').notNull(),
    currency: pgEnumColumn({
      enumName: 'CurrencyCode',
      columnName: 'currency',
      enumBase: CurrencyCode,
    }).notNull(),
    reason: text('reason'),
    status: pgEnumColumn({
      enumName: 'RefundStatus',
      columnName: 'status',
      enumBase: RefundStatus,
    }).notNull(),
    refundProcessedAt: timestamp('refund_processed_at', {
      withTimezone: true,
    }),
    gatewayRefundId: text('gateway_refund_id'),
    notes: text('notes'),
    initiatedByUserId: text('initiated_by_user_id'),
  },
  (table) => [
    constructIndex(TABLE_NAME, [table.paymentId]),
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.status]),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"payment_id" in (select "id" from "payments")`,
      }
    ),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'merchant',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }
    ),
    livemodePolicy(TABLE_NAME),
  ]
).enableRLS()

const columnRefinements = {
  amount: core.safeZodPositiveInteger,
  refundProcessedAt: core.safeZodDate.nullable(),
  status: core.createSafeZodEnum(RefundStatus),
  currency: currencyCodeSchema,
}

export const refundsInsertSchema = createInsertSchema(refunds)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)
export const refundsSelectSchema =
  createSelectSchema(refunds).extend(columnRefinements)
export const refundsUpdateSchema = refundsInsertSchema
  .partial()
  .extend({ id: z.string() })

const createOnlyColumns = {} as const
const readOnlyColumns = {
  organizationId: true,
} as const
const hiddenColumns = {} as const

export const refundClientSelectSchema = refundsSelectSchema
  .omit(hiddenColumns)
  .meta({
    id: 'RefundRecord',
  })

export namespace Refund {
  export type Insert = z.infer<typeof refundsInsertSchema>
  export type Update = z.infer<typeof refundsUpdateSchema>
  export type Record = z.infer<typeof refundsSelectSchema>
  export type ClientRecord = z.infer<typeof refundClientSelectSchema>
}
