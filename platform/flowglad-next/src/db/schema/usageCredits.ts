import {
  boolean,
  text,
  pgTable,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  nullableStringForeignKey,
  constructIndex,
  livemodePolicy,
  pgEnumColumn,
  ommittedColumnsForInsertSchema,
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { subscriptions } from '@/db/schema/subscriptions'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { usageMeters } from '@/db/schema/usageMeters'
import { payments } from '@/db/schema/payments'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import {
  UsageCreditType,
  UsageCreditStatus,
  UsageCreditSourceReferenceType,
} from '@/types'
import core from '@/utils/core'

const TABLE_NAME = 'usage_credits'

export const usageCredits = pgTable(
  TABLE_NAME,
  {
    ...tableBase('usage_credit'),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    livemode: boolean('livemode').notNull(),
    creditType: pgEnumColumn({
      enumName: 'UsageCreditType',
      columnName: 'credit_type',
      enumBase: UsageCreditType,
    }).notNull(),
    sourceReferenceId: text('source_reference_id'),
    sourceReferenceType: pgEnumColumn({
      enumName: 'UsageCreditSourceReferenceType',
      columnName: 'source_reference_type',
      enumBase: UsageCreditSourceReferenceType,
    }).notNull(),
    billingPeriodId: nullableStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    usageMeterId: notNullStringForeignKey(
      'usage_meter_id',
      usageMeters
    ),
    paymentId: nullableStringForeignKey('payment_id', payments),
    issuedAmount: integer('issued_amount').notNull(),
    issuedAt: timestamp('issued_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
    }),
    status: pgEnumColumn({
      enumName: 'UsageCreditStatus',
      columnName: 'status',
      enumBase: UsageCreditStatus,
    }).notNull(),
    notes: text('notes'),
    metadata: jsonb('metadata'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.subscriptionId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.billingPeriodId]),
      constructIndex(TABLE_NAME, [table.usageMeterId]),
      constructIndex(TABLE_NAME, [table.expiresAt]),
      constructIndex(TABLE_NAME, [table.creditType]),
      constructIndex(TABLE_NAME, [table.status]),
      constructIndex(TABLE_NAME, [table.paymentId]),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"subscription_id" in (select "id" from "subscriptions")`,
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
  }
)

const columnRefinements = {
  creditType: core.createSafeZodEnum(UsageCreditType),
  status: core.createSafeZodEnum(UsageCreditStatus),
  sourceReferenceType: core.createSafeZodEnum(
    UsageCreditSourceReferenceType
  ),
  issuedAmount: core.safeZodPositiveInteger,
  issuedAt: z.date(),
  expiresAt: z.date().nullable(),
  metadata: z.record(z.string(), z.string()).nullable(),
  paymentId: z.string().nullable(),
}

/*
 * database schema
 */
export const usageCreditsInsertSchema = createInsertSchema(
  usageCredits
)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)

export const usageCreditsSelectSchema = createSelectSchema(
  usageCredits,
  columnRefinements
).extend(columnRefinements)

export const usageCreditsUpdateSchema = usageCreditsInsertSchema
  .partial()
  .extend({ id: z.string() })

const createOnlyColumns = {
  issuedAmount: true,
  creditType: true,
  status: true,
  subscriptionId: true,
} as const


const hiddenColumns = {
  createdByCommit: true,
  updatedByCommit: true,
} as const

const clientWriteOmits = {
  organizationId: true,
  livemode: true,
} as const

/*
 * client schemas
 */
export const usageCreditClientInsertSchema = usageCreditsInsertSchema
  .omit({
    organizationId: true,
    livemode: true,
  })
  .meta({ id: 'UsageCreditClientInsertSchema' })

export const usageCreditClientUpdateSchema = usageCreditsUpdateSchema
  .omit({
    ...clientWriteOmits,
    ...createOnlyColumns,
    sourceReferenceId: true,
    subscriptionId: true,
  })
  .meta({ id: 'UsageCreditClientUpdateSchema' })

export const usageCreditClientSelectSchema = usageCreditsSelectSchema
  .omit(hiddenColumns)
  .meta({ id: 'UsageCreditClientSelectSchema' })

export namespace UsageCredit {
  export type Insert = z.infer<typeof usageCreditsInsertSchema>
  export type Update = z.infer<typeof usageCreditsUpdateSchema>
  export type Record = z.infer<typeof usageCreditsSelectSchema>
  export type ClientInsert = z.infer<
    typeof usageCreditClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof usageCreditClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof usageCreditClientSelectSchema
  >
}

export const createUsageCreditInputSchema = z.object({
  usageCredit: usageCreditClientInsertSchema,
})

export type CreateUsageCreditInput = z.infer<
  typeof createUsageCreditInputSchema
>

export const editUsageCreditInputSchema = z.object({
  id: z.string(),
  usageCredit: usageCreditClientUpdateSchema,
})
export type EditUsageCreditInput = z.infer<
  typeof editUsageCreditInputSchema
>
