import {
  boolean,
  text,
  pgTable,
  pgPolicy,
  integer,
  timestamp,
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
  createUpdateSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { usageCredits } from '@/db/schema/usageCredits'
import { usageMeters } from '@/db/schema/usageMeters'
import { createSelectSchema } from 'drizzle-zod'
import core from '@/utils/core'

const TABLE_NAME = 'usage_credit_applications'

export const usageCreditApplications = pgTable(
  TABLE_NAME,
  {
    ...tableBase('usage_credit_app'),
    usageCreditId: notNullStringForeignKey(
      'usage_credit_id',
      usageCredits
    ),
    amountApplied: integer('amount_applied').notNull(),
    appliedAt: timestamp('applied_at', {
      withTimezone: true,
    }).defaultNow(),
    targetUsageMeterId: nullableStringForeignKey(
      'target_usage_meter_id',
      usageMeters
    ),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    livemode: boolean('livemode').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).defaultNow(),
  },
  (table) => [
    constructIndex(TABLE_NAME, [table.usageCreditId]),
    pgPolicy('Enable read for own organizations', {
      as: 'permissive',
      to: 'authenticated',
      for: 'all',
      using: sql`"organization_id" in (select "organization_id" from "memberships")`,
    }),
    livemodePolicy(),
  ]
)

const columnRefinements = {
  amountApplied: core.safeZodPositiveInteger,
  appliedAt: core.safeZodDate,
  targetUsageMeterId: z.string().nullable(),
}

export const usageCreditApplicationsInsertSchema =
  enhancedCreateInsertSchema(
    usageCreditApplications,
    columnRefinements
  )

export const usageCreditApplicationsSelectSchema = createSelectSchema(
  usageCreditApplications
).extend(columnRefinements)

export const usageCreditApplicationsUpdateSchema = createUpdateSchema(
  usageCreditApplications,
  columnRefinements
)

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

export const usageCreditApplicationClientInsertSchema =
  usageCreditApplicationsInsertSchema.omit(clientWriteOmits)
export const usageCreditApplicationClientUpdateSchema =
  usageCreditApplicationsUpdateSchema.omit({ ...clientWriteOmits })
export const usageCreditApplicationClientSelectSchema =
  usageCreditApplicationsSelectSchema.omit(hiddenColumns)

export namespace UsageCreditApplication {
  export type Insert = z.infer<
    typeof usageCreditApplicationsInsertSchema
  >
  export type Update = z.infer<
    typeof usageCreditApplicationsUpdateSchema
  >
  export type Record = z.infer<
    typeof usageCreditApplicationsSelectSchema
  >
  export type ClientInsert = z.infer<
    typeof usageCreditApplicationClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof usageCreditApplicationClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof usageCreditApplicationClientSelectSchema
  >
}

export const createUsageCreditApplicationInputSchema = z.object({
  usageCreditApplication: usageCreditApplicationClientInsertSchema,
})
export type CreateUsageCreditApplicationInput = z.infer<
  typeof createUsageCreditApplicationInputSchema
>

export const editUsageCreditApplicationInputSchema = z.object({
  usageCreditApplication: usageCreditApplicationClientUpdateSchema,
})
export type EditUsageCreditApplicationInput = z.infer<
  typeof editUsageCreditApplicationInputSchema
>
