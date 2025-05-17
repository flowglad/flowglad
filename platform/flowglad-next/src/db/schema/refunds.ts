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
  enhancedCreateInsertSchema,
  livemodePolicy,
  createUpdateSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { payments } from '@/db/schema/payments'
import { subscriptions } from '@/db/schema/subscriptions'
import { createSelectSchema } from 'drizzle-zod'
import core from '@/utils/core'
import { RefundStatus } from '@/types'

const TABLE_NAME = 'refunds'

export const refunds = pgTable(
  TABLE_NAME,
  {
    ...tableBase('refund'),
    paymentId: notNullStringForeignKey('payment_id', payments),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    livemode: boolean('livemode').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    reason: text('reason'),
    status: sql`status` as any, // Will be refined by Zod and enum
    refundProcessedAt: timestamp('refund_processed_at', {
      withTimezone: true,
    }),
    gatewayRefundId: text('gateway_refund_id'),
    notes: text('notes'),
    initiatedByUserId: text('initiated_by_user_id'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).defaultNow(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    }).defaultNow(),
  },
  (table) => [
    constructIndex(TABLE_NAME, [table.paymentId]),
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.status]),
    pgPolicy('Enable read for own organizations', {
      as: 'permissive',
      to: 'authenticated',
      for: 'all',
      using: sql`"organization_id" in (select "organization_id" from "memberships")`,
    }),
    livemodePolicy(),
  ]
).enableRLS()

const columnRefinements = {
  amount: core.safeZodPositiveInteger,
  refundProcessedAt: core.safeZodDate.nullable(),
  status: core.createSafeZodEnum(RefundStatus),
  createdAt: core.safeZodDate,
  updatedAt: core.safeZodDate,
}

export const refundsInsertSchema = enhancedCreateInsertSchema(
  refunds,
  columnRefinements
)
export const refundsSelectSchema =
  createSelectSchema(refunds).extend(columnRefinements)
export const refundsUpdateSchema = createUpdateSchema(
  refunds,
  columnRefinements
)

const createOnlyColumns = {} as const
const readOnlyColumns = {
  organizationId: true,
} as const
const hiddenColumns = {} as const

export const refundClientSelectSchema =
  refundsSelectSchema.omit(hiddenColumns)

export namespace Refund {
  export type Insert = z.infer<typeof refundsInsertSchema>
  export type Update = z.infer<typeof refundsUpdateSchema>
  export type Record = z.infer<typeof refundsSelectSchema>
  export type ClientRecord = z.infer<typeof refundClientSelectSchema>
}
