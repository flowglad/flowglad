import { IntervalUnit, SubscriptionStatus } from '@db-core/enums'
import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { uuid, z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import {
  customerClientSelectSchema,
  customers,
} from '@/db/schema/customers'
import { prices, pricesClientSelectSchema } from '@/db/schema/prices'
import {
  constructIndex,
  constructUniqueIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  metadataSchema,
  notNullStringForeignKey,
  nullableStringForeignKey,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'
import { zodEpochMs } from '@/db/timestampMs'
import core from '@/utils/core'
import { organizations } from './organizations'
import { paymentMethods } from './paymentMethods'
import { pricingModels } from './pricingModels'
import { productsClientSelectSchema } from './products'

const TABLE_NAME = 'subscriptions'

const columns = {
  ...tableBase('sub'),
  startDate: timestampWithTimezoneColumn('start_date').notNull(),
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
  trialEnd: timestampWithTimezoneColumn('trial_end'),
  currentBillingPeriodStart: timestampWithTimezoneColumn(
    'current_billing_period_start'
  ),
  currentBillingPeriodEnd: timestampWithTimezoneColumn(
    'current_billing_period_end'
  ),
  metadata: jsonb('metadata'),
  canceledAt: timestampWithTimezoneColumn('canceled_at'),
  cancelScheduledAt: timestampWithTimezoneColumn(
    'cancel_scheduled_at'
  ),
  cancellationReason: text('cancellation_reason'),
  replacedBySubscriptionId: text('replaced_by_subscription_id'),
  /**
   * Indicates whether the subscription's underlying price is a free plan (based on `price.unitPrice === 0`, not `subscriptionItem.unitPrice === 0`).
   * Subscriptions created with `doNotCharge: true` will have `isFreePlan: false` intentionally.
   * This flag indicates the price's nature, not whether it's currently being charged.
   */
  isFreePlan: boolean('is_free_plan').default(false),
  /**
   * When true, indicates that this subscription should never be charged, even if it has a payment method.
   * This is immutable after creation. Subscriptions with doNotCharge=true can be Active
   * without payment methods and will skip all billing runs.
   */
  doNotCharge: boolean('do_not_charge').default(false),
  priceId: notNullStringForeignKey('price_id', prices),
  runBillingAtPeriodStart: boolean(
    'run_billing_at_period_start'
  ).default(true),
  interval: pgEnumColumn({
    enumName: 'IntervalUnit',
    columnName: 'interval',
    enumBase: IntervalUnit,
  }),
  intervalCount: integer('interval_count'),
  billingCycleAnchorDate: timestampWithTimezoneColumn(
    'billing_cycle_anchor_date'
  ),
  name: text('name'),
  renews: boolean('renews').notNull().default(true),
  /**
   * A hidden column, used primarily for managing migrations from
   * from external processors onto Flowglad
   */
  externalId: text('external_id'),
  pricingModelId: notNullStringForeignKey(
    'pricing_model_id',
    pricingModels
  ),
}

export const subscriptions = pgTable(
  TABLE_NAME,
  columns,
  livemodePolicyTable(TABLE_NAME, (table, livemodeIndex) => [
    livemodeIndex([table.customerId]),
    constructIndex(TABLE_NAME, [table.priceId]),
    constructIndex(TABLE_NAME, [table.status]),
    constructIndex(TABLE_NAME, [table.replacedBySubscriptionId]),
    constructIndex(TABLE_NAME, [table.isFreePlan]),
    constructIndex(TABLE_NAME, [table.cancellationReason]),
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    constructUniqueIndex(TABLE_NAME, [table.stripeSetupIntentId]),
    constructUniqueIndex(TABLE_NAME, [
      table.externalId,
      table.organizationId,
    ]),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"customer_id" in (select "id" from "customers")`,
      }
    ),
    merchantPolicy(
      'Enable actions for own organizations via customer',
      {
        as: 'permissive',
        to: 'merchant',
        for: 'all',
        using: sql`"customer_id" in (select "id" from "customers")`,
      }
    ),
    merchantPolicy('Forbid deletion', {
      as: 'restrictive',
      to: 'merchant',
      for: 'delete',
      using: sql`false`,
    }),
  ])
).enableRLS()

const standardSubscriptionStatuses = Object.values(
  SubscriptionStatus
).filter((status) => status !== SubscriptionStatus.CreditTrial) as [
  Exclude<SubscriptionStatus, SubscriptionStatus.CreditTrial>,
  ...Exclude<SubscriptionStatus, SubscriptionStatus.CreditTrial>[],
]

const standardColumnRefinements = {
  status: z.enum(standardSubscriptionStatuses),
  interval: core.createSafeZodEnum(IntervalUnit),
  intervalCount: core.safeZodPositiveInteger,
  renews: z.literal(true),
  metadata: metadataSchema.nullable().optional(),
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
 * database schema via buildSchemas (boolean discriminator 'renews')
 */
export const {
  select: standardSubscriptionSelectSchema,
  insert: standardSubscriptionInsertSchema,
  update: standardSubscriptionUpdateSchema,
  client: {
    select: standardSubscriptionClientSelectSchemaBase,
    insert: standardSubscriptionClientInsertSchema,
    update: standardSubscriptionClientUpdateSchema,
  },
} = buildSchemas(subscriptions, {
  discriminator: 'renews',
  refine: standardColumnRefinements,
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns: {
      stripeSetupIntentId: true,
      externalId: true,
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      livemode: true,
      pricingModelId: true,
    },
    createOnlyColumns: {
      customerId: true,
      doNotCharge: true,
    },
  },
  entityName: 'StandardSubscription',
})

export const {
  select: nonRenewingSubscriptionSelectSchema,
  insert: nonRenewingSubscriptionInsertSchema,
  update: nonRenewingSubscriptionUpdateSchema,
  client: {
    select: nonRenewingSubscriptionClientSelectSchemaBase,
    insert: nonRenewingSubscriptionClientInsertSchema,
    update: nonRenewingSubscriptionClientUpdateSchema,
  },
} = buildSchemas(subscriptions, {
  discriminator: 'renews',
  refine: nonRenewingColumnRefinements,
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns: {
      stripeSetupIntentId: true,
      externalId: true,
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      livemode: true,
      pricingModelId: true,
    },
    createOnlyColumns: {
      customerId: true,
      doNotCharge: true,
    },
  },
  entityName: 'NonRenewingSubscription',
})

export const subscriptionsSelectSchema = z.discriminatedUnion(
  'renews',
  [
    standardSubscriptionSelectSchema,
    nonRenewingSubscriptionSelectSchema,
  ]
)

export const subscriptionsInsertSchema = z.discriminatedUnion(
  'renews',
  [
    standardSubscriptionInsertSchema,
    nonRenewingSubscriptionInsertSchema,
  ]
)

export const subscriptionsUpdateSchema = z.discriminatedUnion(
  'renews',
  [
    standardSubscriptionUpdateSchema,
    nonRenewingSubscriptionUpdateSchema,
  ]
)

/*
 * client schemas (extend buildSchemas with derived "current" field)
 */
export const standardSubscriptionClientSelectSchema =
  standardSubscriptionClientSelectSchemaBase
    .extend({
      current: z
        .boolean()
        .describe(
          'Whether the subscription is current (statuses "active", "trialing", "past_due", or "cancellation_scheduled")'
        ),
    })
    .meta({ id: 'StandardSubscriptionRecord' })

export const nonRenewingSubscriptionClientSelectSchema =
  nonRenewingSubscriptionClientSelectSchemaBase
    .extend({
      current: z
        .boolean()
        .describe(
          'Whether the subscription is current (statuses "active", "trialing", "past_due", "cancellation_scheduled", or "credit_trial")'
        ),
    })
    .meta({ id: 'NonRenewingSubscriptionRecord' })

export const subscriptionClientSelectSchema = z
  .discriminatedUnion('renews', [
    standardSubscriptionClientSelectSchema,
    nonRenewingSubscriptionClientSelectSchema,
  ])
  .meta({ id: 'SubscriptionClientSelectSchema' })

export const subscriptionClientInsertSchema = z
  .discriminatedUnion('renews', [
    standardSubscriptionClientInsertSchema,
    nonRenewingSubscriptionClientInsertSchema,
  ])
  .meta({ id: 'SubscriptionClientInsertSchema' })

export const subscriptionClientUpdateSchema = z
  .discriminatedUnion('renews', [
    standardSubscriptionClientUpdateSchema,
    nonRenewingSubscriptionClientUpdateSchema,
  ])
  .meta({ id: 'SubscriptionClientUpdateSchema' })

export const subscriptionsTableRowDataSchema = z.object({
  subscription: subscriptionClientSelectSchema,
  customer: customerClientSelectSchema,
  price: pricesClientSelectSchema,
  // Product may be null for usage-based subscriptions
  product: productsClientSelectSchema.nullable(),
})

export const subscriptionsPaginatedSelectSchema =
  createPaginatedSelectSchema(
    z.object({
      status: z.enum(SubscriptionStatus).optional(),
      priceId: z.string().optional(),
      customerId: z.string().optional(),
      organizationId: z.string().optional(),
    })
  )

export const subscriptionsPaginatedListSchema =
  createPaginatedListQuerySchema(subscriptionClientSelectSchema)

// Schema for updating subscription payment method
export const updateSubscriptionPaymentMethodSchema = z.object({
  id: z.string().describe('The subscription ID'),
  paymentMethodId: z
    .string()
    .describe('The payment method ID to set for this subscription'),
})

export type UpdateSubscriptionPaymentMethod = z.infer<
  typeof updateSubscriptionPaymentMethodSchema
>

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
  startDate: zodEpochMs
    .optional()
    .describe(
      'The time when the subscription starts. If not provided, defaults to current time.'
    ),
  interval: z.enum(IntervalUnit),
  intervalCount: z
    .number()
    .optional()
    .describe(
      'The number of intervals that each billing period will last. If not provided, defaults to 1'
    ),
  trialEnd: zodEpochMs
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

export const retryBillingRunInputSchema = z.object({
  billingPeriodId: z.string(),
})

export type RetryBillingRunInputSchema = z.infer<
  typeof retryBillingRunInputSchema
>
