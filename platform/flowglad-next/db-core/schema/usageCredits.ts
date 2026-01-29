import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '../createZodSchemas'
import {
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '../enums'
import {
  constructIndex,
  constructUniqueIndex,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  metadataSchema,
  notNullStringForeignKey,
  nullableStringForeignKey,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  tableBase,
  timestampWithTimezoneColumn,
} from '../tableUtils'
import core from '../utils'
import { billingPeriods } from './billingPeriods'
import { organizations } from './organizations'
import { payments } from './payments'
import { pricingModels } from './pricingModels'
import { subscriptions } from './subscriptions'
import { usageMeters } from './usageMeters'

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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.billingPeriodId]),
    constructIndex(TABLE_NAME, [table.usageMeterId]),
    constructIndex(TABLE_NAME, [table.expiresAt]),
    constructIndex(TABLE_NAME, [table.creditType]),
    constructIndex(TABLE_NAME, [table.status]),
    constructIndex(TABLE_NAME, [table.paymentId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    constructIndex(TABLE_NAME, [table.sourceReferenceId]),
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
        using: orgIdEqualsCurrentSQL(),
      }
    ),
  ])
)

const columnRefinements = {
  creditType: core.createSafeZodEnum(UsageCreditType),
  status: core.createSafeZodEnum(UsageCreditStatus),
  sourceReferenceType: core.createSafeZodEnum(
    UsageCreditSourceReferenceType
  ),
  issuedAmount: core.safeZodPositiveInteger,
  metadata: metadataSchema.nullable().optional(),
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
