import {
  pgTable,
  text,
  timestamp,
  jsonb,
  pgPolicy,
  integer,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  pgEnumColumn,
  constructIndex,
  notNullStringForeignKey,
  tableBase,
  livemodePolicy,
  nullableStringForeignKey,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  constructUniqueIndex,
} from '@/db/tableUtils'
import {
  customerClientSelectSchema,
  customers,
} from '@/db/schema/customers'
import { prices, pricesClientSelectSchema } from '@/db/schema/prices'
import { IntervalUnit, SubscriptionStatus } from '@/types'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { organizations } from './organizations'
import core from '@/utils/core'
import { paymentMethods } from './paymentMethods'
import { productsClientSelectSchema } from './products'

const TABLE_NAME = 'subscriptions'

const columns = {
  ...tableBase('sub'),
  customerId: notNullStringForeignKey('customer_id', customers),
  organizationId: notNullStringForeignKey(
    'organization_id',
    organizations
  ),
  status: pgEnumColumn({
    enumName: 'SubscriptionStatus',
    columnName: 'status',
    enumBase: SubscriptionStatus,
  }).notNull(),
  defaultPaymentMethodId: nullableStringForeignKey(
    'default_payment_method_id',
    paymentMethods
  ),
  backupPaymentMethodId: nullableStringForeignKey(
    'backup_payment_method_id',
    paymentMethods
  ),
  stripeSetupIntentId: text('stripe_setup_intent_id'),
  trialEnd: timestamp('trial_end'),
  currentBillingPeriodStart: timestamp(
    'current_billing_period_start'
  ).notNull(),
  currentBillingPeriodEnd: timestamp(
    'current_billing_period_end'
  ).notNull(),
  metadata: jsonb('metadata'),
  canceledAt: timestamp('canceled_at'),
  cancelScheduledAt: timestamp('cancel_scheduled_at'),
  priceId: notNullStringForeignKey('price_id', prices),
  interval: pgEnumColumn({
    enumName: 'IntervalUnit',
    columnName: 'interval',
    enumBase: IntervalUnit,
  }).notNull(),
  intervalCount: integer('interval_count').notNull(),
  billingCycleAnchorDate: timestamp(
    'billing_cycle_anchor_date'
  ).notNull(),
  name: text('name'),
}

export const subscriptions = pgTable(TABLE_NAME, columns, (table) => {
  return [
    constructIndex(TABLE_NAME, [table.customerId]),
    constructIndex(TABLE_NAME, [table.priceId]),
    constructIndex(TABLE_NAME, [table.status]),
    constructUniqueIndex(TABLE_NAME, [table.stripeSetupIntentId]),
    pgPolicy('Enable actions for own organizations via customer', {
      as: 'permissive',
      to: 'authenticated',
      for: 'all',
      using: sql`"customer_id" in (select "id" from "customers")`,
    }),
    pgPolicy('Forbid deletion', {
      as: 'restrictive',
      to: 'authenticated',
      for: 'delete',
      using: sql`false`,
    }),
    livemodePolicy(),
  ]
}).enableRLS()

const columnRefinements = {
  status: z.nativeEnum(SubscriptionStatus),
  currentBillingPeriodStart: z.date(),
  currentBillingPeriodEnd: z.date(),
  trialEnd: z.date().nullable(),
  canceledAt: z.date().nullable(),
  cancelScheduledAt: z.date().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  interval: core.createSafeZodEnum(IntervalUnit),
  intervalCount: core.safeZodPositiveInteger,
}

/*
 * database schema
 */
export const subscriptionsInsertSchema = createSelectSchema(
  subscriptions,
  columnRefinements
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

export const subscriptionsSelectSchema =
  createSelectSchema(subscriptions).extend(columnRefinements)

export const subscriptionsUpdateSchema = createSelectSchema(
  subscriptions,
  columnRefinements
)
  .partial()
  .extend({
    id: z.string(),
  })

const createOnlyColumns = {
  customerId: true,
} as const

const readOnlyColumns = {
  livemode: true,
} as const

const hiddenColumns = {
  stripeSetupIntentId: true,
} as const

const nonClientEditableColumns = {
  ...readOnlyColumns,
  ...hiddenColumns,
  ...createOnlyColumns,
} as const

/*
 * client schemas
 */
export const subscriptionClientInsertSchema =
  subscriptionsInsertSchema.omit(nonClientEditableColumns)

export const subscriptionClientUpdateSchema =
  subscriptionsUpdateSchema.omit(nonClientEditableColumns)

export const subscriptionClientSelectSchema =
  subscriptionsSelectSchema.omit(hiddenColumns)

export const subscriptionsTableRowDataSchema = z.object({
  subscription: subscriptionClientSelectSchema,
  customer: customerClientSelectSchema,
  price: pricesClientSelectSchema,
  product: productsClientSelectSchema,
})

export const subscriptionsPaginatedSelectSchema =
  createPaginatedSelectSchema(
    subscriptionClientSelectSchema.pick({
      status: true,
      priceId: true,
      customerId: true,
      organizationId: true,
    })
  )

export const subscriptionsPaginatedListSchema =
  createPaginatedListQuerySchema(subscriptionClientSelectSchema)

export namespace Subscription {
  export type Insert = z.infer<typeof subscriptionsInsertSchema>
  export type Update = z.infer<typeof subscriptionsUpdateSchema>
  export type Record = z.infer<typeof subscriptionsSelectSchema>
  export type ClientInsert = z.infer<
    typeof subscriptionClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof subscriptionClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof subscriptionClientSelectSchema
  >
  export type TableRowData = z.infer<
    typeof subscriptionsTableRowDataSchema
  >
  export type PaginatedList = z.infer<
    typeof subscriptionsPaginatedListSchema
  >
}

export const createSubscriptionSchema = z.object({
  subscription: subscriptionClientInsertSchema,
})

export type CreateSubscriptionInput = z.infer<
  typeof createSubscriptionSchema
>

export const editSubscriptionSchema = z.object({
  subscription: subscriptionClientUpdateSchema,
  id: z.string(),
})

export type EditSubscriptionInput = z.infer<
  typeof editSubscriptionSchema
>
