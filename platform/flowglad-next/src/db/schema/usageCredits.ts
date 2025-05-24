import {
  boolean,
  text,
  pgTable,
  pgPolicy,
  integer,
  char,
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
  enhancedCreateInsertSchema,
  livemodePolicy,
  pgEnumColumn,
  createUpdateSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { subscriptions } from '@/db/schema/subscriptions'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { usageMeters } from '@/db/schema/usageMeters'
import { payments } from '@/db/schema/payments'
import { createSelectSchema } from 'drizzle-zod'
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
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }),
      livemodePolicy(),
    ]
  }
)

const columnRefinements = {
  creditType: core.createSafeZodEnum(UsageCreditType),
  status: core.createSafeZodEnum(UsageCreditStatus),
  issuedAmount: core.safeZodPositiveInteger,
  issuedAt: core.safeZodDate,
  expiresAt: core.safeZodDate.nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
  paymentId: z.string().nullable().optional(),
}

/*
 * database schema
 */
export const usageCreditsInsertSchema = enhancedCreateInsertSchema(
  usageCredits,
  columnRefinements
)

export const usageCreditsSelectSchema =
  createSelectSchema(usageCredits).extend(columnRefinements)

export const usageCreditsUpdateSchema = createUpdateSchema(
  usageCredits,
  columnRefinements
)

const createOnlyColumns = {
  issuedAmount: true,
  creditType: true,
  status: true,
  subscriptionId: true,
} as const

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const

const hiddenColumns = {
  createdByCommit: true,
  updatedByCommit: true,
} as const

const clientProhibitedColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
} as const

const clientWriteOmits = {
  organizationId: true,
  livemode: true,
} as const

/*
 * client schemas
 */
export const usageCreditClientInsertSchema =
  usageCreditsInsertSchema.omit({
    organizationId: true,
    livemode: true,
  })

export const usageCreditClientUpdateSchema =
  usageCreditsUpdateSchema.omit({
    ...clientWriteOmits,
    ...createOnlyColumns,
    sourceReferenceId: true,
    subscriptionId: true,
  })

export const usageCreditClientSelectSchema =
  usageCreditsSelectSchema.omit(hiddenColumns)

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
