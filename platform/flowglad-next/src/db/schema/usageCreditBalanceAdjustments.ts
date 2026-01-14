import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { organizations } from '@/db/schema/organizations'
import { pricingModels } from '@/db/schema/pricingModels'
import { usageCredits } from '@/db/schema/usageCredits'
import { usageMeters } from '@/db/schema/usageMeters'
import { users } from '@/db/schema/users'
import {
  constructIndex,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  metadataSchema,
  notNullStringForeignKey,
  nullableStringForeignKey,
  orgIdEqualsCurrentSQL,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'
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
    usageMeterId: notNullStringForeignKey(
      'usage_meter_id',
      usageMeters
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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.adjustedUsageCreditId]),
    constructIndex(TABLE_NAME, [table.adjustedByUserId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
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
        using: orgIdEqualsCurrentSQL(),
      }
    ),
  ])
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
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns: {
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      organizationId: true,
      livemode: true,
      pricingModelId: true,
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
