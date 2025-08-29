import {
  boolean,
  text,
  pgTable,
  pgPolicy,
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
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { usageCredits } from '@/db/schema/usageCredits'
import { users } from '@/db/schema/users'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import core from '@/utils/core'

const TABLE_NAME = 'usage_credit_balance_adjustments'

export const usageCreditBalanceAdjustments = pgTable(
  TABLE_NAME,
  {
    ...tableBase('usage_credit_balance_adjustment'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    adjustedUsageCreditId: notNullStringForeignKey(
      'adjusted_usage_credit_id',
      usageCredits
    ),
    amountAdjusted: integer('amount_adjusted').notNull(),
    reason: text('reason').notNull(),
    adjustedByUserId: nullableStringForeignKey(
      'adjusted_by_user_id',
      users
    ),
    adjustmentInitiatedAt: timestamp('adjustment_initiated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    notes: text('notes'),
    metadata: jsonb('metadata'),
    livemode: boolean('livemode').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.adjustedUsageCreditId]),
      constructIndex(TABLE_NAME, [table.adjustedByUserId]),
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
  amountAdjusted: core.safeZodPositiveInteger,
  adjustmentInitiatedAt: core.safeZodDate,
  notes: z.string().nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
  adjustedByUserId: z.string().nullable(),
}

export const usageCreditBalanceAdjustmentsInsertSchema =
  createInsertSchema(usageCreditBalanceAdjustments).omit(ommittedColumnsForInsertSchema).extend(columnRefinements)

export const usageCreditBalanceAdjustmentsSelectSchema =
  createSelectSchema(usageCreditBalanceAdjustments).extend(
    columnRefinements
  )

export const usageCreditBalanceAdjustmentsUpdateSchema =
  usageCreditBalanceAdjustmentsInsertSchema.partial().extend({ id: z.string() })

const createOnlyColumns = {} as const

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
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
export const usageCreditBalanceAdjustmentClientInsertSchema =
  usageCreditBalanceAdjustmentsInsertSchema.omit(clientWriteOmits).meta({ id: 'UsageCreditBalanceAdjustmentInsert' })

export const usageCreditBalanceAdjustmentClientUpdateSchema =
  usageCreditBalanceAdjustmentsUpdateSchema.omit({
    ...clientWriteOmits,
  }).meta({ id: 'UsageCreditBalanceAdjustmentUpdate' })

export const usageCreditBalanceAdjustmentClientSelectSchema =
  usageCreditBalanceAdjustmentsSelectSchema.omit(hiddenColumns).meta({ id: 'UsageCreditBalanceAdjustmentRecord' })

export namespace UsageCreditBalanceAdjustment {
  export type Insert = z.infer<
    typeof usageCreditBalanceAdjustmentsInsertSchema
  >
  export type Update = z.infer<
    typeof usageCreditBalanceAdjustmentsUpdateSchema
  >
  export type Record = z.infer<
    typeof usageCreditBalanceAdjustmentsSelectSchema
  >
  export type ClientInsert = z.infer<
    typeof usageCreditBalanceAdjustmentClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof usageCreditBalanceAdjustmentClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof usageCreditBalanceAdjustmentClientSelectSchema
  >
}

export const createUsageCreditBalanceAdjustmentInputSchema = z.object(
  {
    usageCreditBalanceAdjustment:
      usageCreditBalanceAdjustmentClientInsertSchema,
  }
)

export type CreateUsageCreditBalanceAdjustmentInput = z.infer<
  typeof createUsageCreditBalanceAdjustmentInputSchema
>

export const editUsageCreditBalanceAdjustmentInputSchema = z.object({
  usageCreditBalanceAdjustment:
    usageCreditBalanceAdjustmentClientUpdateSchema,
})
export type EditUsageCreditBalanceAdjustmentInput = z.infer<
  typeof editUsageCreditBalanceAdjustmentInputSchema
>
