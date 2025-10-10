import {
  boolean,
  text,
  pgTable,
  integer,
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
  merchantPolicy,
  enableCustomerReadPolicy,
  constructUniqueIndex,
  timestampWithTimezoneColumn,
  hiddenColumnsForClientSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { subscriptions } from '@/db/schema/subscriptions'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { usageMeters } from '@/db/schema/usageMeters'
import { payments } from '@/db/schema/payments'
import {
  UsageCreditType,
  UsageCreditStatus,
  UsageCreditSourceReferenceType,
} from '@/types'
import core from '@/utils/core'
import { buildSchemas } from '@/db/createZodSchemas'

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
    issuedAt: timestampWithTimezoneColumn('issued_at')
      .notNull()
      .defaultNow(),
    expiresAt: timestampWithTimezoneColumn('expires_at'),
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
      constructUniqueIndex(TABLE_NAME, [
        table.paymentId,
        table.subscriptionId,
        table.usageMeterId,
      ]),
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
  metadata: z.json().nullable(),
  paymentId: z.string().nullable(),
}

export const {
  select: usageCreditsSelectSchema,
  insert: usageCreditsInsertSchema,
  update: usageCreditsUpdateSchema,
  client: {
    insert: usageCreditClientInsertSchema,
    select: usageCreditClientSelectSchema,
    update: usageCreditClientUpdateSchema,
  },
} = buildSchemas(usageCredits, {
  refine: {
    ...columnRefinements,
  },
  client: {
    hiddenColumns: {
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      organizationId: true,
      livemode: true,
    },
    createOnlyColumns: {
      issuedAmount: true,
      creditType: true,
      status: true,
      subscriptionId: true,
      sourceReferenceId: true,
    },
  },
  entityName: 'UsageCredit',
})

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
