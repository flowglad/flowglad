import { currencyCodeSchema } from '@db-core/commonZodSchema'
import { buildSchemas } from '@db-core/createZodSchemas'
import {
  constructIndex,
  enableCustomerReadPolicy,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  ommittedColumnsForInsertSchema,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  tableBase,
  timestampWithTimezoneColumn,
} from '@db-core/tableUtils'
import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { organizations } from '@/db/schema/organizations'
import { payments } from '@/db/schema/payments'
import { pricingModels } from '@/db/schema/pricingModels'
import { subscriptions } from '@/db/schema/subscriptions'
import { CurrencyCode, RefundStatus } from '@/types'
import core from '@/utils/core'

const TABLE_NAME = 'refunds'

export const refunds = pgTable(
  TABLE_NAME,
  {
    ...tableBase('refund'),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
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
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.pricingModelId]),
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
        using: orgIdEqualsCurrentSQL(),
      }
    ),
  ])
).enableRLS()

const columnRefinements = {
  amount: core.safeZodPositiveInteger,
  status: core.createSafeZodEnum(RefundStatus),
  currency: currencyCodeSchema,
}

const insertRefine = {
  pricingModelId: z.string().optional(),
}

const createOnlyColumns = {} as const
const readOnlyColumns = {
  organizationId: true,
  pricingModelId: true,
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
  insertRefine,
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
