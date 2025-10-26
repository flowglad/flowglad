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
  timestampWithTimezoneColumn,
  hiddenColumnsForClientSchema,
  metadataSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { usageCredits } from '@/db/schema/usageCredits'
import { users } from '@/db/schema/users'
import core from '@/utils/core'
import { buildSchemas } from '@/db/createZodSchemas'

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
    adjustmentInitiatedAt: timestampWithTimezoneColumn(
      'adjustment_initiated_at'
    )
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
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"adjusted_usage_credit_id" in (select "id" from "usage_credits")`,
        }
      ),
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          to: 'all',
          using: sql`"organization_id" in (select "organization_id" from "memberships")`,
        }
      ),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

const columnRefinements = {
  amountAdjusted: core.safeZodPositiveInteger,
  notes: z.string().nullable().optional(),
  metadata: metadataSchema.nullable().optional(),
  adjustedByUserId: z.string().nullable().optional(),
}

export const {
  select: usageCreditBalanceAdjustmentsSelectSchema,
  insert: usageCreditBalanceAdjustmentsInsertSchema,
  update: usageCreditBalanceAdjustmentsUpdateSchema,
  client: {
    insert: usageCreditBalanceAdjustmentClientInsertSchema,
    update: usageCreditBalanceAdjustmentClientUpdateSchema,
    select: usageCreditBalanceAdjustmentClientSelectSchema,
  },
} = buildSchemas(usageCreditBalanceAdjustments, {
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
    createOnlyColumns: {},
  },
  entityName: 'UsageCreditBalanceAdjustment',
})

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
