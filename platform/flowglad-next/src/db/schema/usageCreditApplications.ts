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
  livemodePolicy,
  pgEnumColumn,
  ommittedColumnsForInsertSchema,
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { usageCredits } from '@/db/schema/usageCredits'
import { usageMeters } from '@/db/schema/usageMeters'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import core from '@/utils/core'
import { usageEvents } from './usageEvents'
import { UsageCreditApplicationStatus } from '@/types'

const TABLE_NAME = 'usage_credit_applications'

export const usageCreditApplications = pgTable(
  TABLE_NAME,
  {
    ...tableBase('usage_credit_app'),
    status: pgEnumColumn({
      enumName: 'UsageCreditApplicationStatus',
      columnName: 'status',
      enumBase: UsageCreditApplicationStatus,
    }).notNull(),
    usageCreditId: notNullStringForeignKey(
      'usage_credit_id',
      usageCredits
    ),
    usageEventId: notNullStringForeignKey(
      'usage_event_id',
      usageEvents
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
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"usage_credit_id" in (select "id" from "usage_credits")`,
      }
    ),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'all',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }
    ),
    livemodePolicy(TABLE_NAME),
  ]
)

const columnRefinements = {
  amountApplied: core.safeZodPositiveInteger,
  appliedAt: core.safeZodDate,
  status: core.createSafeZodEnum(UsageCreditApplicationStatus),
  targetUsageMeterId: z.string().nullable().optional(),
}

export const usageCreditApplicationsInsertSchema = createInsertSchema(
  usageCreditApplications
)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)

export const usageCreditApplicationsSelectSchema = createSelectSchema(
  usageCreditApplications
).extend(columnRefinements)

export const usageCreditApplicationsUpdateSchema =
  usageCreditApplicationsInsertSchema
    .partial()
    .extend({ id: z.string() })

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
  usageCreditApplicationsInsertSchema
    .omit(clientWriteOmits)
    .meta({ id: 'UsageCreditApplicationClientInsertSchema' })
export const usageCreditApplicationClientUpdateSchema =
  usageCreditApplicationsUpdateSchema
    .omit({ ...clientWriteOmits })
    .meta({ id: 'UsageCreditApplicationClientUpdateSchema' })
export const usageCreditApplicationClientSelectSchema =
  usageCreditApplicationsSelectSchema
    .omit(hiddenColumns)
    .meta({ id: 'UsageCreditApplicationClientSelectSchema' })

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
