import { boolean, pgTable, integer } from 'drizzle-orm/pg-core'
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
  zodEpochMs,
  hiddenColumnsForClientSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { usageCredits } from '@/db/schema/usageCredits'
import { usageMeters } from '@/db/schema/usageMeters'
import core from '@/utils/core'
import { usageEvents } from './usageEvents'
import { UsageCreditApplicationStatus } from '@/types'
import { buildSchemas } from '@/db/createZodSchemas'

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
    appliedAt: timestampWithTimezoneColumn('applied_at').defaultNow(),
    targetUsageMeterId: nullableStringForeignKey(
      'target_usage_meter_id',
      usageMeters
    ),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    livemode: boolean('livemode').notNull(),
    createdAt: timestampWithTimezoneColumn('created_at').defaultNow(),
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
).enableRLS()

const columnRefinements = {
  amountApplied: core.safeZodPositiveInteger,
  appliedAt: zodEpochMs,
  status: core.createSafeZodEnum(UsageCreditApplicationStatus),
  targetUsageMeterId: z.string().nullable().optional(),
}

export const {
  select: usageCreditApplicationsSelectSchema,
  insert: usageCreditApplicationsInsertSchema,
  update: usageCreditApplicationsUpdateSchema,
  client: {
    insert: usageCreditApplicationClientInsertSchema,
    update: usageCreditApplicationClientUpdateSchema,
    select: usageCreditApplicationClientSelectSchema,
  },
} = buildSchemas(usageCreditApplications, {
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
  entityName: 'UsageCreditApplication',
})

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
