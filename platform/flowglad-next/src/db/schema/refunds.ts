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
  timestampWithTimezoneColumn,
  zodEpochMs,
} from '@/db/tableUtils'
import { buildSchemas } from '@/db/createZodSchemas'
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
    refundProcessedAt: timestampWithTimezoneColumn(
      'refund_processed_at'
    ),
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
  refundProcessedAt: zodEpochMs.nullable(),
  status: core.createSafeZodEnum(RefundStatus),
  currency: currencyCodeSchema,
}

const createOnlyColumns = {} as const
const readOnlyColumns = {
  organizationId: true,
} as const
const hiddenColumns = {} as const

export const {
  insert: refundsInsertSchema,
  select: refundsSelectSchema,
  update: refundsUpdateSchema,
  client: {
    select: refundClientSelectSchema,
    insert: refundClientInsertSchema,
    update: refundClientUpdateSchema,
  },
} = buildSchemas(refunds, {
  refine: columnRefinements,
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
})

export namespace Refund {
  export type Insert = z.infer<typeof refundsInsertSchema>
  export type Update = z.infer<typeof refundsUpdateSchema>
  export type Record = z.infer<typeof refundsSelectSchema>
  export type ClientRecord = z.infer<typeof refundClientSelectSchema>
}
