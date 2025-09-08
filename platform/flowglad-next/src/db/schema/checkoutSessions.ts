import { z } from 'zod'
import {
  jsonb,
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  pgPolicy,
} from 'drizzle-orm/pg-core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import {
  tableBase,
  ommittedColumnsForInsertSchema,
  pgEnumColumn,
  constructIndex,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
  nullableStringForeignKey,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  customerPolicy,
} from '@/db/tableUtils'
import { billingAddressSchema } from '@/db/schema/organizations'
import core from '@/utils/core'
import { prices } from './prices'
import {
  PaymentMethodType,
  CheckoutSessionStatus,
  CheckoutSessionType,
} from '@/types'
import { organizations } from './organizations'
import { purchases } from './purchases'
import { discounts } from './discounts'
import { customers } from './customers'
import { sql } from 'drizzle-orm'
import { invoices } from './invoices'

const TABLE_NAME = 'checkout_sessions'

// Schema descriptions
const CHECKOUT_SESSIONS_BASE_DESCRIPTION =
  'A checkout session record, which describes a checkout process that can be used to complete purchases, invoices, or product orders. Each session has a specific type that determines its behavior and required fields.'
const PURCHASE_CHECKOUT_SESSION_DESCRIPTION =
  'A checkout session for a customized purchase, which will complete the purchase record and (if for a subscription price) a subscription upon successful completion.'
const INVOICE_CHECKOUT_SESSION_DESCRIPTION =
  'A checkout session for an invoice, which will only create a payment record associated with the invoice upon successful completion. It will not create a subscription or purchase.'
const PRODUCT_CHECKOUT_SESSION_DESCRIPTION =
  'A checkout session for a product, which will create a purchase record and (if for a subscription price) a subscription upon successful completion.'
const PAYMENT_METHOD_CREATION_CHECKOUT_SESSION_DESCRIPTION =
  'A checkout session for a payment method creation, which will create a payment method record upon successful completion. If targetSubscriptionId is provided, the payment method will be added to the subscription as the default payment method.'
const ACTIVATE_SUBSCRIPTION_CHECKOUT_SESSION_DESCRIPTION =
  'A checkout session to activate a subscription, which will create a payment method and associate it with the subscription, and then attempt to pay any outstanding invoices for that subscription.'

const columns = {
  ...tableBase('chckt_session'),
  status: pgEnumColumn({
    enumName: 'CheckoutSessionStatus',
    columnName: 'status',
    enumBase: CheckoutSessionStatus,
  }).notNull(),
  billingAddress: jsonb('billing_address'),
  priceId: nullableStringForeignKey('price_id', prices),
  purchaseId: nullableStringForeignKey('purchase_id', purchases),
  invoiceId: nullableStringForeignKey('invoice_id', invoices),
  // outputMetadata: jsonb('output_metadata'),
  /**
   * Should only be non-1 in the case of priceId is not null.
   */
  quantity: integer('quantity').notNull().default(1),
  organizationId: notNullStringForeignKey(
    'organization_id',
    organizations
  ),
  customerName: text('customer_name'),
  customerEmail: text('customer_email'),
  stripeSetupIntentId: text('stripe_setup_intent_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  customerId: nullableStringForeignKey('customer_id', customers),
  /**
   * Default to 24 hours from now
   */
  expires: timestamp('expires')
    .notNull()
    .$defaultFn(() => new Date(Date.now() + 1000 * 60 * 60 * 24)),
  paymentMethodType: pgEnumColumn({
    enumName: 'PaymentMethodType',
    columnName: 'payment_method_type',
    enumBase: PaymentMethodType,
  }),
  discountId: nullableStringForeignKey('discount_id', discounts),
  successUrl: text('successUrl'),
  cancelUrl: text('cancelUrl'),
  type: pgEnumColumn({
    enumName: 'CheckoutSessionType',
    columnName: 'type',
    enumBase: CheckoutSessionType,
  }).notNull(),
  preserveBillingCycleAnchor: boolean('preserve_billing_cycle_anchor')
    .notNull()
    .default(false),
  outputMetadata: jsonb('output_metadata'),
  outputName: text('output_name'),
  targetSubscriptionId: text('target_subscription_id'),
  automaticallyUpdateSubscriptions: boolean(
    'automatically_update_subscriptions'
  ),
}

export const checkoutSessions = pgTable(
  TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.priceId]),
      constructIndex(TABLE_NAME, [table.stripePaymentIntentId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.status]),
      constructIndex(TABLE_NAME, [table.stripeSetupIntentId]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructIndex(TABLE_NAME, [table.discountId]),
      constructIndex(TABLE_NAME, [table.customerId]),
      merchantPolicy(
        'Enable all actions for discounts in own organization',
        {
          as: 'permissive',
          to: 'all',
          for: 'all',
          using: sql`"organization_id" in (select "organization_id" from "memberships")`,
        }
      ),
      customerPolicy('Enable select for customer', {
        as: 'permissive',
        for: 'select',
        using: sql`"customer_id" in (select id from "customers") and "organization_id" = current_organization_id()`,
      }),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

export const checkoutSessionOutputMetadataSchema = z
  .record(z.string(), z.any())
  .nullable()

// Common refinements for both SELECT and INSERT schemas (validation logic)
const commonRefinement = {
  billingAddress: billingAddressSchema.nullable().optional(),
  status: core.createSafeZodEnum(CheckoutSessionStatus),
  successUrl: z.url().nullable().optional(),
  cancelUrl: z.url().nullable().optional(),
  // outputMetadata: z.any().nullable(),
  paymentMethodType: core
    .createSafeZodEnum(PaymentMethodType)
    .nullable()
    .optional(),
  outputMetadata: checkoutSessionOutputMetadataSchema.optional(),
}

// Refinements for SELECT schemas only (includes auto-generated columns)
const selectRefinement = {
  ...newBaseZodSelectSchemaColumns,
  ...commonRefinement,
}

// Refinements for INSERT schemas (without auto-generated columns)
const insertRefinement = {
  ...commonRefinement,
}

const purchaseCheckoutSessionRefinement = {
  purchaseId: z.string(),
  priceId: z.string(),
  targetSubscriptionId: core.safeZodNullOrUndefined,
  automaticallyUpdateSubscriptions: core.safeZodNullOrUndefined,
  type: z.literal(CheckoutSessionType.Purchase),
  preserveBillingCycleAnchor: z.literal(false).optional(),
}

const invoiceCheckoutSessionRefinement = {
  invoiceId: z.string(),
  priceId: z.null(),
  purchaseId: z.null(),
  automaticallyUpdateSubscriptions: core.safeZodNullOrUndefined,
  targetSubscriptionId: z.null(),
  type: z.literal(CheckoutSessionType.Invoice),
  outputMetadata: z.null(),
  preserveBillingCycleAnchor: z.literal(false).optional(),
}

export const invoiceCheckoutSessionNulledColumns = {
  priceId: null,
  purchaseId: null,
  outputMetadata: null,
  automaticallyUpdateSubscriptions: null,
  preserveBillingCycleAnchor: false,
  targetSubscriptionId: null,
} as const

const preserveBillingCycleAnchorSchema = z
  .boolean()
  .optional()
  .describe(
    'Whether to preserve the billing cycle anchor date in the case that the customer already has an active subscription that renews. If not provided, defaults to false.'
  )

const productCheckoutSessionRefinement = {
  priceId: z.string(),
  invoiceId: z.null(),
  targetSubscriptionId: core.safeZodNullOrUndefined,
  automaticallyUpdateSubscriptions: core.safeZodNullOrUndefined,
  type: z.literal(CheckoutSessionType.Product),
  preserveBillingCycleAnchor: preserveBillingCycleAnchorSchema,
}

const activateSubscriptionRefinement = {
  type: z.literal(CheckoutSessionType.ActivateSubscription),
  targetSubscriptionId: z.string(),
  invoiceId: z.null(),
  purchaseId: z.null(),
  preserveBillingCycleAnchor: preserveBillingCycleAnchorSchema,
}

const addPaymentMethodCheckoutSessionRefinement = {
  targetSubscriptionId: z
    .string()
    .nullable()
    .optional()
    .describe(
      'The subscription that the payment method will be added to as the default payment method.'
    ),
  customerId: z
    .string()
    .describe(
      'The customer that the payment method will be added to as the default payment method.'
    ),
  type: z.literal(CheckoutSessionType.AddPaymentMethod),
  automaticallyUpdateSubscriptions: z
    .boolean()
    .optional()
    .describe(
      'Whether to automatically update all current subscriptions to the new payment method. Defaults to false.'
    ),
}

export const coreCheckoutSessionsSelectSchema = createSelectSchema(
  checkoutSessions,
  selectRefinement
)

const purchaseCheckoutSessionsSelectSchema =
  coreCheckoutSessionsSelectSchema
    .extend(purchaseCheckoutSessionRefinement)
    .describe(PURCHASE_CHECKOUT_SESSION_DESCRIPTION)
const invoiceCheckoutSessionsSelectSchema =
  coreCheckoutSessionsSelectSchema
    .extend(invoiceCheckoutSessionRefinement)
    .describe(INVOICE_CHECKOUT_SESSION_DESCRIPTION)

const productCheckoutSessionsSelectSchema =
  coreCheckoutSessionsSelectSchema
    .extend(productCheckoutSessionRefinement)
    .describe(PRODUCT_CHECKOUT_SESSION_DESCRIPTION)

const addPaymentMethodCheckoutSessionsSelectSchema =
  coreCheckoutSessionsSelectSchema
    .extend(addPaymentMethodCheckoutSessionRefinement)
    .describe(PAYMENT_METHOD_CREATION_CHECKOUT_SESSION_DESCRIPTION)

const activateSubscriptionCheckoutSessionsSelectSchema =
  coreCheckoutSessionsSelectSchema
    .extend(activateSubscriptionRefinement)
    .describe(ACTIVATE_SUBSCRIPTION_CHECKOUT_SESSION_DESCRIPTION)

export const checkoutSessionsSelectSchema = z
  .discriminatedUnion('type', [
    purchaseCheckoutSessionsSelectSchema,
    invoiceCheckoutSessionsSelectSchema,
    productCheckoutSessionsSelectSchema,
    addPaymentMethodCheckoutSessionsSelectSchema,
    activateSubscriptionCheckoutSessionsSelectSchema,
  ])
  .describe(CHECKOUT_SESSIONS_BASE_DESCRIPTION)

export const coreCheckoutSessionsInsertSchema = createInsertSchema(
  checkoutSessions
)
  .omit(ommittedColumnsForInsertSchema)
  .extend(insertRefinement)

export const purchaseCheckoutSessionsInsertSchema =
  coreCheckoutSessionsInsertSchema.extend(
    purchaseCheckoutSessionRefinement
  )
export const invoiceCheckoutSessionsInsertSchema =
  coreCheckoutSessionsInsertSchema.extend(
    invoiceCheckoutSessionRefinement
  )
export const productCheckoutSessionsInsertSchema =
  coreCheckoutSessionsInsertSchema.extend(
    productCheckoutSessionRefinement
  )
export const addPaymentMethodCheckoutSessionsInsertSchema =
  coreCheckoutSessionsInsertSchema.extend(
    addPaymentMethodCheckoutSessionRefinement
  )

export const activateSubscriptionCheckoutSessionsInsertSchema =
  coreCheckoutSessionsInsertSchema.extend(
    activateSubscriptionRefinement
  )

export const checkoutSessionsInsertSchema = z
  .discriminatedUnion('type', [
    purchaseCheckoutSessionsInsertSchema,
    invoiceCheckoutSessionsInsertSchema,
    productCheckoutSessionsInsertSchema,
    addPaymentMethodCheckoutSessionsInsertSchema,
    activateSubscriptionCheckoutSessionsInsertSchema,
  ])
  .meta({
    id: 'CheckoutSessionInsert',
  })
  .describe(CHECKOUT_SESSIONS_BASE_DESCRIPTION)

export const coreCheckoutSessionsUpdateSchema =
  coreCheckoutSessionsInsertSchema.partial().extend({
    id: z.string(),
  })

const purchaseCheckoutSessionUpdateSchema =
  coreCheckoutSessionsUpdateSchema.extend(
    purchaseCheckoutSessionRefinement
  )
const invoiceCheckoutSessionUpdateSchema =
  coreCheckoutSessionsUpdateSchema.extend(
    invoiceCheckoutSessionRefinement
  )
const productCheckoutSessionUpdateSchema =
  coreCheckoutSessionsUpdateSchema.extend(
    productCheckoutSessionRefinement
  )
const addPaymentMethodCheckoutSessionUpdateSchema =
  coreCheckoutSessionsUpdateSchema.extend(
    addPaymentMethodCheckoutSessionRefinement
  )

const activateSubscriptionCheckoutSessionUpdateSchema =
  coreCheckoutSessionsUpdateSchema.extend(
    activateSubscriptionRefinement
  )

export const checkoutSessionsUpdateSchema = z
  .discriminatedUnion('type', [
    purchaseCheckoutSessionUpdateSchema,
    invoiceCheckoutSessionUpdateSchema,
    productCheckoutSessionUpdateSchema,
    addPaymentMethodCheckoutSessionUpdateSchema,
    activateSubscriptionCheckoutSessionUpdateSchema,
  ])
  .describe(CHECKOUT_SESSIONS_BASE_DESCRIPTION)

export const createCheckoutSessionInputSchema = z
  .object({
    checkoutSession: checkoutSessionsInsertSchema,
  })
  .meta({
    id: 'CreateCheckoutSessionInput',
  })

const readOnlyColumns = {
  expires: true,
  status: true,
  stripePaymentIntentId: true,
  stripeSetupIntentId: true,
  purchaseId: true,
} as const

const purchaseCheckoutSessionClientUpdateSchema =
  purchaseCheckoutSessionUpdateSchema
    .omit(readOnlyColumns)
    .extend({
      id: z.string(),
    })
    .meta({
      id: 'PurchaseCheckoutSessionUpdate',
    })
const invoiceCheckoutSessionClientUpdateSchema =
  invoiceCheckoutSessionUpdateSchema
    .omit(readOnlyColumns)
    .extend({
      id: z.string(),
    })
    .meta({
      id: 'InvoiceCheckoutSessionUpdate',
    })
const productCheckoutSessionClientUpdateSchema =
  productCheckoutSessionUpdateSchema
    .omit(readOnlyColumns)
    .extend({
      id: z.string(),
    })
    .meta({
      id: 'ProductCheckoutSessionUpdate',
    })
const addPaymentMethodCheckoutSessionClientUpdateSchema =
  addPaymentMethodCheckoutSessionUpdateSchema
    .omit(readOnlyColumns)
    .extend({
      id: z.string(),
    })
    .meta({
      id: 'AddPaymentMethodCheckoutSessionUpdate',
    })

const activateSubscriptionCheckoutSessionClientUpdateSchema =
  activateSubscriptionCheckoutSessionUpdateSchema
    .omit(readOnlyColumns)
    .extend({
      id: z.string(),
    })
    .meta({
      id: 'ActivateSubscriptionCheckoutSessionUpdate',
    })

const checkoutSessionClientUpdateSchema = z
  .discriminatedUnion('type', [
    purchaseCheckoutSessionClientUpdateSchema,
    invoiceCheckoutSessionClientUpdateSchema,
    productCheckoutSessionClientUpdateSchema,
    addPaymentMethodCheckoutSessionClientUpdateSchema,
    activateSubscriptionCheckoutSessionClientUpdateSchema,
  ])
  .meta({
    id: 'CheckoutSessionUpdate',
  })
  .describe(CHECKOUT_SESSIONS_BASE_DESCRIPTION)

export const editCheckoutSessionInputSchema = z.object({
  checkoutSession: checkoutSessionClientUpdateSchema,
  purchaseId: z.string().nullish(),
})

export type EditCheckoutSessionInput = z.infer<
  typeof editCheckoutSessionInputSchema
>
const hiddenColumns = {
  expires: true,
  stripePaymentIntentId: true,
  stripeSetupIntentId: true,
  createdByCommit: true,
  updatedByCommit: true,
  ...hiddenColumnsForClientSchema,
} as const

const CHECKOUT_SESSION_CLIENT_SELECT_SCHEMA_DESCRIPTION =
  'A time-limited checkout session, which captures the payment details needed to create a subscription, or purchase, or pay a standalone invoice.'

export const purchaseCheckoutSessionClientSelectSchema =
  purchaseCheckoutSessionsSelectSchema.omit(hiddenColumns).meta({
    id: 'PurchaseCheckoutSessionRecord',
  })
export const invoiceCheckoutSessionClientSelectSchema =
  invoiceCheckoutSessionsSelectSchema.omit(hiddenColumns).meta({
    id: 'InvoiceCheckoutSessionRecord',
  })
export const productCheckoutSessionClientSelectSchema =
  productCheckoutSessionsSelectSchema.omit(hiddenColumns).meta({
    id: 'ProductCheckoutSessionRecord',
  })
export const addPaymentMethodCheckoutSessionClientSelectSchema =
  addPaymentMethodCheckoutSessionsSelectSchema
    .omit(hiddenColumns)
    .meta({
      id: 'AddPaymentMethodCheckoutSessionRecord',
    })
export const activateSubscriptionCheckoutSessionClientSelectSchema =
  activateSubscriptionCheckoutSessionsSelectSchema
    .omit(hiddenColumns)
    .meta({
      id: 'ActivateSubscriptionCheckoutSessionRecord',
    })

export const checkoutSessionClientSelectSchema = z
  .discriminatedUnion('type', [
    purchaseCheckoutSessionClientSelectSchema,
    invoiceCheckoutSessionClientSelectSchema,
    productCheckoutSessionClientSelectSchema,
    addPaymentMethodCheckoutSessionClientSelectSchema,
    activateSubscriptionCheckoutSessionClientSelectSchema,
  ])
  .meta({
    id: 'CheckoutSessionRecord',
  })
  .describe(CHECKOUT_SESSION_CLIENT_SELECT_SCHEMA_DESCRIPTION)

const feeReadyColumns = {
  billingAddress: billingAddressSchema,
  paymentMethodType: core.createSafeZodEnum(PaymentMethodType),
} as const

export const feeReadyPurchaseCheckoutSessionSelectSchema =
  purchaseCheckoutSessionClientSelectSchema.extend(feeReadyColumns)
export const feeReadyInvoiceCheckoutSessionSelectSchema =
  invoiceCheckoutSessionClientSelectSchema.extend(feeReadyColumns)
export const feeReadyProductCheckoutSessionSelectSchema =
  productCheckoutSessionClientSelectSchema.extend(feeReadyColumns)
export const feeReadyAddPaymentMethodCheckoutSessionSelectSchema =
  addPaymentMethodCheckoutSessionClientSelectSchema.extend(
    feeReadyColumns
  )
export const feeReadyActivateSubscriptionCheckoutSessionSelectSchema =
  activateSubscriptionCheckoutSessionClientSelectSchema.extend(
    feeReadyColumns
  )

const FEE_READY_CHECKOUT_SESSION_SELECT_SCHEMA_DESCRIPTION =
  'A checkout session that is ready to be used to calculate a fee.'

export const feeReadyCheckoutSessionSelectSchema = z
  .discriminatedUnion('type', [
    feeReadyPurchaseCheckoutSessionSelectSchema,
    feeReadyInvoiceCheckoutSessionSelectSchema,
    feeReadyProductCheckoutSessionSelectSchema,
    feeReadyAddPaymentMethodCheckoutSessionSelectSchema,
    feeReadyActivateSubscriptionCheckoutSessionSelectSchema,
  ])
  .describe(FEE_READY_CHECKOUT_SESSION_SELECT_SCHEMA_DESCRIPTION)

export const checkoutSessionsPaginatedSelectSchema =
  createPaginatedSelectSchema(checkoutSessionClientSelectSchema)

export const checkoutSessionsPaginatedListSchema =
  createPaginatedListQuerySchema(checkoutSessionClientSelectSchema)

export namespace CheckoutSession {
  export type Insert = z.infer<typeof checkoutSessionsInsertSchema>
  export type PurchaseInsert = z.infer<
    typeof purchaseCheckoutSessionsInsertSchema
  >
  export type InvoiceInsert = z.infer<
    typeof invoiceCheckoutSessionsInsertSchema
  >
  export type ProductInsert = z.infer<
    typeof productCheckoutSessionsInsertSchema
  >
  export type ActivateSubscriptionInsert = z.infer<
    typeof activateSubscriptionCheckoutSessionsInsertSchema
  >

  export type Update = z.infer<typeof checkoutSessionsUpdateSchema>

  export type PurchaseUpdate = z.infer<
    typeof purchaseCheckoutSessionUpdateSchema
  >
  export type InvoiceUpdate = z.infer<
    typeof invoiceCheckoutSessionUpdateSchema
  >
  export type ProductUpdate = z.infer<
    typeof productCheckoutSessionUpdateSchema
  >
  export type ActivateSubscriptionUpdate = z.infer<
    typeof activateSubscriptionCheckoutSessionUpdateSchema
  >

  export type PurchaseRecord = z.infer<
    typeof purchaseCheckoutSessionsSelectSchema
  >
  export type InvoiceRecord = z.infer<
    typeof invoiceCheckoutSessionsSelectSchema
  >
  export type ProductRecord = z.infer<
    typeof productCheckoutSessionsSelectSchema
  >
  export type ActivateSubscriptionRecord = z.infer<
    typeof activateSubscriptionCheckoutSessionsSelectSchema
  >

  export type Record = z.infer<typeof checkoutSessionsSelectSchema>
  export type SubscriptionCreatingRecord =
    | ProductRecord
    | PurchaseRecord
  export type PurchaseClientRecord = z.infer<
    typeof purchaseCheckoutSessionClientSelectSchema
  >

  export type InvoiceClientRecord = z.infer<
    typeof invoiceCheckoutSessionClientSelectSchema
  >

  export type ProductClientRecord = z.infer<
    typeof productCheckoutSessionClientSelectSchema
  >

  export type ActivateSubscriptionClientRecord = z.infer<
    typeof activateSubscriptionCheckoutSessionClientSelectSchema
  >

  export type ClientRecord = z.infer<
    typeof checkoutSessionClientSelectSchema
  >

  export type PurchaseClientUpdate = z.infer<
    typeof purchaseCheckoutSessionClientUpdateSchema
  >

  export type InvoiceClientUpdate = z.infer<
    typeof invoiceCheckoutSessionClientUpdateSchema
  >

  export type ProductClientUpdate = z.infer<
    typeof productCheckoutSessionClientUpdateSchema
  >

  export type ActivateSubscriptionClientUpdate = z.infer<
    typeof activateSubscriptionCheckoutSessionClientUpdateSchema
  >

  export type ClientUpdate = z.infer<
    typeof checkoutSessionClientUpdateSchema
  >
  /**
   * A Purchase Session that has all the parameters necessary to create a FeeCalcuation
   */
  export type FeeReadyRecord = z.infer<
    typeof feeReadyCheckoutSessionSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof checkoutSessionsPaginatedListSchema
  >
  export type OutputMetadata = z.infer<
    typeof checkoutSessionOutputMetadataSchema
  >

  export type Where = SelectConditions<typeof checkoutSessions>

  export type AddPaymentMethodInsert = z.infer<
    typeof addPaymentMethodCheckoutSessionsInsertSchema
  >

  export type AddPaymentMethodUpdate = z.infer<
    typeof addPaymentMethodCheckoutSessionUpdateSchema
  >

  export type AddPaymentMethodRecord = z.infer<
    typeof addPaymentMethodCheckoutSessionsSelectSchema
  >

  export type AddPaymentMethodClientRecord = z.infer<
    typeof addPaymentMethodCheckoutSessionClientSelectSchema
  >

  export type AddPaymentMethodClientUpdate = z.infer<
    typeof addPaymentMethodCheckoutSessionClientUpdateSchema
  >
}

export const getPaymentIntentStatusInputSchema = z.object({
  paymentIntentId: z.string(),
  type: z.literal('paymentIntent'),
})

export const getSetupIntentStatusInputSchema = z.object({
  setupIntentId: z.string(),
  type: z.literal('setupIntent'),
})

export const getCheckoutIntentStatusInputSchema = z.object({
  checkoutSessionId: z.string(),
  type: z.literal('checkoutSession'),
})

export const getIntentStatusInputSchema = z.discriminatedUnion(
  'type',
  [
    getPaymentIntentStatusInputSchema,
    getSetupIntentStatusInputSchema,
    getCheckoutIntentStatusInputSchema,
  ]
)

export type GetIntentStatusInput = z.infer<
  typeof getIntentStatusInputSchema
>

const coreCheckoutSessionSchema = z.object({
  customerExternalId: z
    .string()
    .describe(
      'The id of the Customer for this purchase session, as defined in your system'
    ),
  successUrl: z
    .string()
    .describe(
      'The URL to redirect to after the purchase is successful'
    ),
  cancelUrl: z
    .string()
    .describe(
      'The URL to redirect to after the purchase is canceled or fails'
    ),
  outputMetadata: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Metadata that will get added to the purchase or subscription created when this checkout session succeeds. Ignored if the checkout session is of type `invoice`.'
    ),
  outputName: z
    .string()
    .optional()
    .describe(
      'The name of the purchase or subscription created when this checkout session succeeds. Ignored if the checkout session is of type `invoice`.'
    ),
})

export const productCheckoutSessionSchema = z.discriminatedUnion(
  'anonymous',
  [
    coreCheckoutSessionSchema.extend({
      type: z.literal(CheckoutSessionType.Product),
      priceId: z
        .string()
        .describe('The ID of the price the customer shall purchase'),
      quantity: z
        .number()
        .optional()
        .describe(
          'The quantity of the purchase or subscription created when this checkout session succeeds. Ignored if the checkout session is of type `invoice`.'
        ),
      anonymous: z.literal(false).optional(),
      preserveBillingCycleAnchor: preserveBillingCycleAnchorSchema,
    }),
    coreCheckoutSessionSchema.extend({
      type: z.literal(CheckoutSessionType.Product),
      priceId: z
        .string()
        .describe('The ID of the price the customer shall purchase'),
      quantity: z
        .number()
        .optional()
        .describe(
          'The quantity of the purchase or subscription created when this checkout session succeeds. Ignored if the checkout session is of type `invoice`.'
        ),
      anonymous: z.literal(true),
      customerExternalId: z.null().optional(),
      preserveBillingCycleAnchor: preserveBillingCycleAnchorSchema,
    }),
  ]
)

export const addPaymentMethodCheckoutSessionSchema =
  coreCheckoutSessionSchema.extend({
    type: z.literal(CheckoutSessionType.AddPaymentMethod),
    targetSubscriptionId: z
      .string()
      .optional()
      .describe(
        'The id of the subscription that the payment method will be added to as the default payment method.'
      ),
    automaticallyUpdateSubscriptions: z
      .boolean()
      .optional()
      .describe(
        'Whether to automatically update all current subscriptions to the new payment method. Defaults to false.'
      ),
  })

export const activateSubscriptionCheckoutSessionSchema =
  coreCheckoutSessionSchema.extend({
    type: z.literal(CheckoutSessionType.ActivateSubscription),
    priceId: z.string(),
    targetSubscriptionId: z.string(),
    preserveBillingCycleAnchor: preserveBillingCycleAnchorSchema,
  })

const createCheckoutSessionObject = z.discriminatedUnion('type', [
  productCheckoutSessionSchema,
  activateSubscriptionCheckoutSessionSchema,
  addPaymentMethodCheckoutSessionSchema,
])

export type CreateCheckoutSessionObject = z.infer<
  typeof createCheckoutSessionObject
>

export const singleCheckoutSessionOutputSchema = z.object({
  checkoutSession: checkoutSessionClientSelectSchema,
  url: z
    .string()
    .describe('The URL to redirect to complete the purchase'),
})

export const createCheckoutSessionSchema = z
  .preprocess(
    (val) => {
      const v = val as any
      const cs = v?.checkoutSession
      if (
        cs?.type === CheckoutSessionType.Product &&
        cs.anonymous === undefined
      ) {
        return { ...v, checkoutSession: { ...cs, anonymous: false } }
      }
      return v
    },
    z.object({
      checkoutSession: createCheckoutSessionObject,
    })
  )
  .describe('Use this schema for new checkout sessions.')

export type CreateCheckoutSessionInput = z.infer<
  typeof createCheckoutSessionSchema
>
