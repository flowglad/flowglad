import * as R from 'ramda'
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  pgPolicy,
  integer,
  boolean,
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
  metadataSchema,
  SelectConditions,
  ommittedColumnsForInsertSchema,
  hiddenColumnsForClientSchema,
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
  startDate: timestamp('start_date').notNull(),
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
  ),
  currentBillingPeriodEnd: timestamp('current_billing_period_end'),
  metadata: jsonb('metadata'),
  canceledAt: timestamp('canceled_at'),
  cancelScheduledAt: timestamp('cancel_scheduled_at'),
  priceId: nullableStringForeignKey('price_id', prices),
  runBillingAtPeriodStart: boolean(
    'run_billing_at_period_start'
  ).default(true),
  interval: pgEnumColumn({
    enumName: 'IntervalUnit',
    columnName: 'interval',
    enumBase: IntervalUnit,
  }),
  intervalCount: integer('interval_count'),
  billingCycleAnchorDate: timestamp('billing_cycle_anchor_date'),
  name: text('name'),
  renews: boolean('renews').notNull().default(true),
  /**
   * A hidden column, used primarily for managing migrations from
   * from external processors onto Flowglad
   */
  externalId: text('external_id'),
}

export const subscriptions = pgTable(TABLE_NAME, columns, (table) => {
  return [
    constructIndex(TABLE_NAME, [table.customerId]),
    constructIndex(TABLE_NAME, [table.priceId]),
    constructIndex(TABLE_NAME, [table.status]),
    constructUniqueIndex(TABLE_NAME, [table.stripeSetupIntentId]),
    constructUniqueIndex(TABLE_NAME, [
      table.externalId,
      table.organizationId,
    ]),
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

const standardSubscriptionStatuses = Object.values(
  SubscriptionStatus
).filter((status) => status !== SubscriptionStatus.CreditTrial) as [
  Exclude<SubscriptionStatus, SubscriptionStatus.CreditTrial>,
  ...Exclude<SubscriptionStatus, SubscriptionStatus.CreditTrial>[],
]

const standardColumnRefinements = {
  status: z.enum(standardSubscriptionStatuses),
  currentBillingPeriodStart: z.date(),
  currentBillingPeriodEnd: z.date(),
  trialEnd: z.date().nullable().optional(),
  canceledAt: z.date().nullable().optional(),
  cancelScheduledAt: z.date().nullable().optional(),
  metadata: metadataSchema.nullable().optional(),
  interval: core.createSafeZodEnum(IntervalUnit),
  intervalCount: core.safeZodPositiveInteger,
  billingCycleAnchorDate: z.date(),
  renews: z.literal(true),
}

export const nonRenewingStatusSchema = z.enum([
  SubscriptionStatus.Active,
  SubscriptionStatus.Canceled,
  SubscriptionStatus.CreditTrial,
])

export const nonRenewingColumnRefinements = {
  status: nonRenewingStatusSchema,
  metadata: metadataSchema.nullable().optional(),
  currentBillingPeriodStart: core.safeZodNullOrUndefined,
  currentBillingPeriodEnd: core.safeZodNullOrUndefined,
  trialEnd: core.safeZodNullOrUndefined,
  interval: core.safeZodNullOrUndefined,
  intervalCount: core.safeZodNullOrUndefined,
  billingCycleAnchorDate: core.safeZodNullOrUndefined,
  renews: z.literal(false),
}

/*
 * database schema
 */
const baseSelectSchema = createSelectSchema(subscriptions)

export const standardSubscriptionSelectSchema =
  baseSelectSchema.extend(standardColumnRefinements)

export const nonRenewingSubscriptionSelectSchema =
  baseSelectSchema.extend(nonRenewingColumnRefinements)

export const subscriptionsSelectSchema = z.discriminatedUnion(
  'renews',
  [
    standardSubscriptionSelectSchema,
    nonRenewingSubscriptionSelectSchema,
  ]
)

const standardSubscriptionInsertSchema =
  standardSubscriptionSelectSchema.omit(
    ommittedColumnsForInsertSchema
  )
const nonRenewingSubscriptionInsertSchema =
  nonRenewingSubscriptionSelectSchema.omit(
    ommittedColumnsForInsertSchema
  )
export const subscriptionsInsertSchema = z.discriminatedUnion(
  'renews',
  [
    standardSubscriptionInsertSchema,
    nonRenewingSubscriptionInsertSchema,
  ]
)

const standardSubscriptionUpdateSchema =
  standardSubscriptionInsertSchema.partial().extend({
    id: z.string(),
    renews: z.literal(true),
  })

const nonRenewingSubscriptionUpdateSchema =
  nonRenewingSubscriptionInsertSchema.partial().extend({
    id: z.string(),
    renews: z.literal(false),
  })

export const subscriptionsUpdateSchema = z.discriminatedUnion(
  'renews',
  [
    standardSubscriptionUpdateSchema,
    nonRenewingSubscriptionUpdateSchema,
  ]
)

const createOnlyColumns = {
  customerId: true,
} as const

const readOnlyColumns = {
  livemode: true,
} as const

const hiddenColumns = {
  stripeSetupIntentId: true,
  externalId: true,
  ...hiddenColumnsForClientSchema,
} as const

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
  ...createOnlyColumns,
})

const nonClientEditableColumns = {
  ...readOnlyColumns,
  ...hiddenColumns,
  ...createOnlyColumns,
} as const

/*
 * client schemas
 */

export const standardSubscriptionClientSelectSchema =
  standardSubscriptionSelectSchema.omit(hiddenColumns).extend({
    current: z
      .boolean()
      .describe(
        'Whether the subscription is current (statuses "active", "trialing", "past_due", or "cancellation_scheduled")'
      ),
  })

export const nonRenewingSubscriptionClientSelectSchema =
  nonRenewingSubscriptionSelectSchema.omit(hiddenColumns).extend({
    current: z
      .boolean()
      .describe(
        'Whether the subscription is current (statuses "active", "trialing", "past_due", "cancellation_scheduled", or "credit_trial")'
      ),
  })

export const subscriptionClientSelectSchema = z.discriminatedUnion(
  'renews',
  [
    standardSubscriptionClientSelectSchema,
    nonRenewingSubscriptionClientSelectSchema,
  ]
)

const standardSubscriptionClientInsertSchema =
  standardSubscriptionInsertSchema.omit(clientWriteOmits)
const nonRenewingSubscriptionClientInsertSchema =
  nonRenewingSubscriptionInsertSchema.omit(clientWriteOmits)
export const subscriptionClientInsertSchema = z.discriminatedUnion(
  'renews',
  [
    standardSubscriptionClientInsertSchema,
    nonRenewingSubscriptionClientInsertSchema,
  ]
)

const standardSubscriptionClientUpdateSchema =
  standardSubscriptionUpdateSchema.omit(clientWriteOmits)
const nonRenewingSubscriptionClientUpdateSchema =
  nonRenewingSubscriptionUpdateSchema.omit(clientWriteOmits)
export const subscriptionClientUpdateSchema = z.discriminatedUnion(
  'renews',
  [
    standardSubscriptionClientUpdateSchema,
    nonRenewingSubscriptionClientUpdateSchema,
  ]
)

export const subscriptionsTableRowDataSchema = z.object({
  subscription: subscriptionClientSelectSchema,
  customer: customerClientSelectSchema,
  price: pricesClientSelectSchema,
  product: productsClientSelectSchema,
})

export const subscriptionsPaginatedSelectSchema =
  createPaginatedSelectSchema(
    z.object({
      status: z.nativeEnum(SubscriptionStatus).optional(),
      priceId: z.string().optional(),
      customerId: z.string().optional(),
      organizationId: z.string().optional(),
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
  export type Where = SelectConditions<typeof subscriptions>

  export type StandardRecord = z.infer<
    typeof standardSubscriptionSelectSchema
  >
  export type NonRenewingRecord = z.infer<
    typeof nonRenewingSubscriptionSelectSchema
  >
  export type StandardInsert = z.infer<
    typeof standardSubscriptionInsertSchema
  >
  export type NonRenewingInsert = z.infer<
    typeof nonRenewingSubscriptionInsertSchema
  >
  export type StandardUpdate = z.infer<
    typeof standardSubscriptionUpdateSchema
  >
  export type NonRenewingUpdate = z.infer<
    typeof nonRenewingSubscriptionUpdateSchema
  >

  export type ClientStandardRecord = z.infer<
    typeof standardSubscriptionClientSelectSchema
  >
  export type ClientNonRenewingRecord = z.infer<
    typeof nonRenewingSubscriptionClientSelectSchema
  >
  export type ClientStandardInsert = z.infer<
    typeof standardSubscriptionClientInsertSchema
  >
  export type ClientNonRenewingInsert = z.infer<
    typeof nonRenewingSubscriptionClientInsertSchema
  >
  export type ClientStandardUpdate = z.infer<
    typeof standardSubscriptionClientUpdateSchema
  >
  export type ClientNonRenewingUpdate = z.infer<
    typeof nonRenewingSubscriptionClientUpdateSchema
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

export const createSubscriptionInputSchema = z.object({
  customerId: z
    .string()
    .describe('The customer for the subscription.'),
  priceId: z
    .string()
    .describe(
      `The price to subscribe to. Used to determine whether the subscription is ` +
        `usage-based or not, and set other defaults such as trial period and billing intervals.`
    ),
  quantity: z
    .number()
    .describe('The quantity of the price purchased.'),
  startDate: z
    .date()
    .optional()
    .describe(
      'The time when the subscription starts. If not provided, defaults to current time.'
    ),
  interval: z.nativeEnum(IntervalUnit),
  intervalCount: z
    .number()
    .optional()
    .describe(
      'The number of intervals that each billing period will last. If not provided, defaults to 1'
    ),
  trialEnd: z
    .date()
    .optional()
    .describe(
      `The time when the trial ends. If not provided, defaults to startDate + the associated price's trialPeriodDays`
    ),
  metadata: metadataSchema.optional(),
  name: z
    .string()
    .optional()
    .describe(
      `The name of the subscription. If not provided, defaults ` +
        `to the name of the product associated with the price provided by 'priceId'.`
    ),
  defaultPaymentMethodId: z
    .string()
    .optional()
    .describe(
      `The default payment method to use when attempting to run charges for the subscription.` +
        `If not provided, the customer's default payment method will be used. ` +
        `If no default payment method is present, charges will not run. ` +
        `If no default payment method is provided and there is a trial ` +
        `period for the subscription, ` +
        `the subscription will enter 'trial_ended' status at the end of the trial period.`
    ),
  backupPaymentMethodId: z
    .string()
    .optional()
    .describe(
      `The payment method to try if charges for the subscription fail with the default payment method.`
    ),
})

export type CreateSubscriptionInputSchema = z.infer<
  typeof createSubscriptionInputSchema
>
