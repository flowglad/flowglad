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
import { billingAddressSchema } from '@/db/schema/organizations'
import {
  constructIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  customerPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicy,
  merchantPolicy,
  metadataSchema,
  notNullStringForeignKey,
  nullableStringForeignKey,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PaymentMethodType,
} from '@/types'
import core from '@/utils/core'
import { zodEpochMs } from '../timestampMs'
import { customers } from './customers'
import { discounts } from './discounts'
import { invoices } from './invoices'
import { organizations } from './organizations'
import { prices } from './prices'
import { pricingModels } from './pricingModels'
import { purchases } from './purchases'

const TABLE_NAME = 'checkout_sessions'

// Schema descriptions
const CHECKOUT_SESSIONS_BASE_DESCRIPTION =
  'A checkout session record, which describes a checkout process that can be used to complete purchases, invoices, or product orders. Each session has a specific type that determines its behavior and required fields.'
const PURCHASE_CHECKOUT_SESSION_DESCRIPTION =
  'A checkout session for a customized purchase, which will complete the purchase record and (if for a subscription price) a subscription upon successful completion.'
const PRODUCT_CHECKOUT_SESSION_DESCRIPTION =
  'A checkout session for a product, which will create a purchase record and (if for a subscription price) a subscription upon successful completion.'
const PAYMENT_METHOD_CREATION_CHECKOUT_SESSION_DESCRIPTION =
  'A checkout session for a payment method creation, which will create a payment method record upon successful completion. If targetSubscriptionId is provided, the payment method will be added to the subscription as the default payment method.'
const ACTIVATE_SUBSCRIPTION_CHECKOUT_SESSION_DESCRIPTION =
  'A checkout session to activate a subscription, which will create a payment method and associate it with the subscription, and then attempt to pay any outstanding invoices for that subscription.'

const columns = {
  ...tableBase('chckt_session'),
  pricingModelId: notNullStringForeignKey(
    'pricing_model_id',
    pricingModels
  ),
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
  expires: timestampWithTimezoneColumn('expires')
    .notNull()
    .$defaultFn(() => Date.now() + 1000 * 60 * 60 * 24),
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
      constructIndex(TABLE_NAME, [table.pricingModelId]),
      constructIndex(TABLE_NAME, [table.priceId]),
      constructIndex(TABLE_NAME, [table.stripePaymentIntentId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.status]),
      constructIndex(TABLE_NAME, [table.stripeSetupIntentId]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructIndex(TABLE_NAME, [table.discountId]),
      constructIndex(TABLE_NAME, [table.customerId]),
      merchantPolicy(
        'Enable all actions for checkout_sessions in own organization',
        {
          as: 'permissive',
          to: 'all',
          for: 'all',
          using: orgIdEqualsCurrentSQL(),
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

const insertRefine = {
  expires: zodEpochMs
    .default(() => Date.now() + 1000 * 60 * 60 * 24)
    .optional(),
  pricingModelId: z.string().optional(),
}

// Common refinements for all schemas (validation logic)
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
  outputMetadata: metadataSchema.nullable().optional(),
}

const purchaseCheckoutSessionRefinement = {
  purchaseId: z.string(),
  priceId: z.string(),
  targetSubscriptionId: core.safeZodNullOrUndefined.optional(),
  automaticallyUpdateSubscriptions:
    core.safeZodNullOrUndefined.optional(),
  type: z.literal(CheckoutSessionType.Purchase),
  preserveBillingCycleAnchor: z.literal(false).optional(),
}

const preserveBillingCycleAnchorSchema = z
  .boolean()
  .optional()
  .describe(
    'Whether to preserve the billing cycle anchor date in the case that the customer already has an active subscription that renews. If not provided, defaults to false.'
  )

const productCheckoutSessionRefinement = {
  priceId: z.string(),
  invoiceId: z.null().optional(),
  targetSubscriptionId: core.safeZodNullOrUndefined.optional(),
  automaticallyUpdateSubscriptions:
    core.safeZodNullOrUndefined.optional(),
  type: z.literal(CheckoutSessionType.Product),
  preserveBillingCycleAnchor: preserveBillingCycleAnchorSchema,
}

const activateSubscriptionRefinement = {
  type: z.literal(CheckoutSessionType.ActivateSubscription),
  targetSubscriptionId: z.string(),
  invoiceId: z.null().optional(),
  purchaseId: z.null().optional(),
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
    .nullable()
    .optional()
    .describe(
      'Whether to automatically update all current subscriptions to the new payment method. Defaults to false.'
    ),
}

// Client schema visibility and write constraints
const hiddenColumns = {
  expires: true,
  stripePaymentIntentId: true,
  stripeSetupIntentId: true,
  ...hiddenColumnsForClientSchema,
} as const

const readOnlyColumns = {
  expires: true,
  status: true,
  stripePaymentIntentId: true,
  stripeSetupIntentId: true,
  purchaseId: true,
  pricingModelId: true,
} as const

const clientRefinements = {
  hiddenColumns,
  readOnlyColumns,
}
// Build per-subtype schemas using shared builder
export const {
  insert: purchaseCheckoutSessionsInsertSchema,
  select: purchaseCheckoutSessionsSelectSchema,
  update: purchaseCheckoutSessionUpdateSchema,
  client: {
    insert: purchaseCheckoutSessionClientInsertSchema,
    select: purchaseCheckoutSessionClientSelectSchemaBase,
    update: purchaseCheckoutSessionClientUpdateSchemaBase,
  },
} = buildSchemas(checkoutSessions, {
  discriminator: 'type',
  refine: {
    ...commonRefinement,
    ...purchaseCheckoutSessionRefinement,
  },
  insertRefine,
  client: clientRefinements,
  entityName: 'PurchaseCheckoutSession',
})

export const {
  insert: productCheckoutSessionsInsertSchema,
  select: productCheckoutSessionsSelectSchema,
  update: productCheckoutSessionUpdateSchema,
  client: {
    insert: productCheckoutSessionClientInsertSchema,
    select: productCheckoutSessionClientSelectSchemaBase,
    update: productCheckoutSessionClientUpdateSchemaBase,
  },
} = buildSchemas(checkoutSessions, {
  discriminator: 'type',
  refine: {
    ...commonRefinement,
    ...productCheckoutSessionRefinement,
  },
  insertRefine,
  client: clientRefinements,
  entityName: 'ProductCheckoutSession',
})

export const {
  insert: addPaymentMethodCheckoutSessionsInsertSchema,
  select: addPaymentMethodCheckoutSessionsSelectSchema,
  update: addPaymentMethodCheckoutSessionUpdateSchema,
  client: {
    insert: addPaymentMethodCheckoutSessionClientInsertSchema,
    select: addPaymentMethodCheckoutSessionClientSelectSchemaBase,
    update: addPaymentMethodCheckoutSessionClientUpdateSchemaBase,
  },
} = buildSchemas(checkoutSessions, {
  discriminator: 'type',
  refine: {
    ...commonRefinement,
    ...addPaymentMethodCheckoutSessionRefinement,
  },
  insertRefine,
  client: clientRefinements,
  entityName: 'AddPaymentMethodCheckoutSession',
})

export const {
  insert: activateSubscriptionCheckoutSessionsInsertSchema,
  select: activateSubscriptionCheckoutSessionsSelectSchema,
  update: activateSubscriptionCheckoutSessionUpdateSchema,
  client: {
    insert: activateSubscriptionCheckoutSessionClientInsertSchema,
    select: activateSubscriptionCheckoutSessionClientSelectSchemaBase,
    update: activateSubscriptionCheckoutSessionClientUpdateSchemaBase,
  },
} = buildSchemas(checkoutSessions, {
  discriminator: 'type',
  refine: { ...commonRefinement, ...activateSubscriptionRefinement },
  client: clientRefinements,
  insertRefine,
  entityName: 'ActivateSubscriptionCheckoutSession',
})

export const checkoutSessionsSelectSchema = z
  .discriminatedUnion('type', [
    purchaseCheckoutSessionsSelectSchema,
    productCheckoutSessionsSelectSchema,
    addPaymentMethodCheckoutSessionsSelectSchema,
    activateSubscriptionCheckoutSessionsSelectSchema,
  ])
  .describe(CHECKOUT_SESSIONS_BASE_DESCRIPTION)

export const checkoutSessionsInsertSchema = z
  .discriminatedUnion('type', [
    purchaseCheckoutSessionsInsertSchema,
    productCheckoutSessionsInsertSchema,
    addPaymentMethodCheckoutSessionsInsertSchema,
    activateSubscriptionCheckoutSessionsInsertSchema,
  ])
  .meta({
    id: 'CheckoutSessionInsert',
  })
  .describe(CHECKOUT_SESSIONS_BASE_DESCRIPTION)

export const checkoutSessionsUpdateSchema = z
  .discriminatedUnion('type', [
    purchaseCheckoutSessionUpdateSchema,
    productCheckoutSessionUpdateSchema,
    addPaymentMethodCheckoutSessionUpdateSchema,
    activateSubscriptionCheckoutSessionUpdateSchema,
  ])
  .describe(CHECKOUT_SESSIONS_BASE_DESCRIPTION)

// Client UPDATE schemas with metadata ids applied
export const purchaseCheckoutSessionClientUpdateSchema =
  purchaseCheckoutSessionClientUpdateSchemaBase.meta({
    id: 'PurchaseCheckoutSessionUpdate',
  })
export const productCheckoutSessionClientUpdateSchema =
  productCheckoutSessionClientUpdateSchemaBase.meta({
    id: 'ProductCheckoutSessionUpdate',
  })
export const addPaymentMethodCheckoutSessionClientUpdateSchema =
  addPaymentMethodCheckoutSessionClientUpdateSchemaBase.meta({
    id: 'AddPaymentMethodCheckoutSessionUpdate',
  })
export const activateSubscriptionCheckoutSessionClientUpdateSchema =
  activateSubscriptionCheckoutSessionClientUpdateSchemaBase.meta({
    id: 'ActivateSubscriptionCheckoutSessionUpdate',
  })

const checkoutSessionClientUpdateSchema = z
  .discriminatedUnion('type', [
    purchaseCheckoutSessionClientUpdateSchema,
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
const CHECKOUT_SESSION_CLIENT_SELECT_SCHEMA_DESCRIPTION =
  'A time-limited checkout session, which captures the payment details needed to create a subscription, or purchase, or pay a standalone invoice.'

// Apply metadata ids to client SELECT schemas for consistency
export const purchaseCheckoutSessionClientSelectSchema =
  purchaseCheckoutSessionClientSelectSchemaBase.meta({
    id: 'PurchaseCheckoutSessionRecord',
  })
export const productCheckoutSessionClientSelectSchema =
  productCheckoutSessionClientSelectSchemaBase.meta({
    id: 'ProductCheckoutSessionRecord',
  })
export const addPaymentMethodCheckoutSessionClientSelectSchema =
  addPaymentMethodCheckoutSessionClientSelectSchemaBase.meta({
    id: 'AddPaymentMethodCheckoutSessionRecord',
  })
export const activateSubscriptionCheckoutSessionClientSelectSchema =
  activateSubscriptionCheckoutSessionClientSelectSchemaBase.meta({
    id: 'ActivateSubscriptionCheckoutSessionRecord',
  })

export const checkoutSessionClientSelectSchema = z
  .discriminatedUnion('type', [
    purchaseCheckoutSessionClientSelectSchema,
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
  export type ProductUpdate = z.infer<
    typeof productCheckoutSessionUpdateSchema
  >
  export type ActivateSubscriptionUpdate = z.infer<
    typeof activateSubscriptionCheckoutSessionUpdateSchema
  >

  export type PurchaseRecord = z.infer<
    typeof purchaseCheckoutSessionsSelectSchema
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
  export type OutputMetadata = z.infer<typeof metadataSchema>

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

const coreCheckoutSessionInputSchema = z.object({
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
  outputMetadata: metadataSchema.nullable().optional(),
  outputName: z
    .string()
    .optional()
    .describe(
      'The name of the purchase or subscription created when this checkout session succeeds. Ignored if the checkout session is of type `invoice`.'
    ),
})

const identifiedProductCheckoutSessionInputSchemaBase =
  coreCheckoutSessionInputSchema.extend({
    type: z.literal(CheckoutSessionType.Product),
    priceId: z
      .string()
      .optional()
      .describe(
        'The ID of the price the customer shall purchase. If not provided, priceSlug is required.'
      ),
    priceSlug: z
      .string()
      .optional()
      .describe(
        'The slug of the price the customer shall purchase. If not provided, priceId is required.'
      ),
    quantity: z
      .number()
      .optional()
      .describe(
        'The quantity of the purchase or subscription created when this checkout session succeeds. Ignored if the checkout session is of type `invoice`.'
      ),
    anonymous: z.literal(false).optional(),
    preserveBillingCycleAnchor: preserveBillingCycleAnchorSchema,
  })

export const identifiedProductCheckoutSessionInputSchema =
  identifiedProductCheckoutSessionInputSchemaBase
    .refine(
      (data) => (data.priceId ? !data.priceSlug : !!data.priceSlug),
      {
        message:
          'Either priceId or priceSlug must be provided, but not both',
        path: ['priceId'],
      }
    )
    .meta({ id: 'IdentifiedProductCheckoutSessionInput' })

export const anonymousProductCheckoutSessionInputSchema =
  identifiedProductCheckoutSessionInputSchemaBase
    .extend({
      anonymous: z.literal(true),
      customerExternalId: z.null().optional(),
      priceSlug: z
        .string()
        .optional()
        .describe(
          "The slug of the price the customer shall purchase from the organization's default pricing model. If not provided, priceId is required."
        ),
    })
    .refine(
      (data) => (data.priceId ? !data.priceSlug : !!data.priceSlug),
      {
        message:
          'Either priceId or priceSlug must be provided, but not both',
        path: ['priceId'],
      }
    )
    .meta({ id: 'AnonymousProductCheckoutSessionInput' })

export const productCheckoutSessionInputSchema = z
  .discriminatedUnion('anonymous', [
    identifiedProductCheckoutSessionInputSchema,
    anonymousProductCheckoutSessionInputSchema,
  ])
  .meta({ id: 'ProductCheckoutSessionInput' })

export const addPaymentMethodCheckoutSessionInputSchema =
  coreCheckoutSessionInputSchema
    .extend({
      type: z.literal(CheckoutSessionType.AddPaymentMethod),
      targetSubscriptionId: z
        .string()
        .optional()
        .describe(
          'The id of the subscription that the payment method will be added to as the default payment method.'
        ),
      automaticallyUpdateSubscriptions: z
        .boolean()
        .nullable()
        .optional()
        .describe(
          'Whether to automatically update all current subscriptions to the new payment method. Defaults to false.'
        ),
    })
    .meta({ id: 'AddPaymentMethodCheckoutSessionInput' })

export const activateSubscriptionCheckoutSessionInputSchema =
  coreCheckoutSessionInputSchema
    .extend({
      type: z.literal(CheckoutSessionType.ActivateSubscription),
      targetSubscriptionId: z.string(),
      preserveBillingCycleAnchor: preserveBillingCycleAnchorSchema,
    })
    .meta({ id: 'ActivateSubscriptionCheckoutSessionInput' })

// Customer-billing variants (omit successUrl and cancelUrl)

const urlFields = { cancelUrl: true, successUrl: true } as const

export const customerBillingIdentifiedProductCheckoutSessionInputSchema =
  identifiedProductCheckoutSessionInputSchema.omit(urlFields)

export const customerBillingAnonymousProductCheckoutSessionInputSchema =
  anonymousProductCheckoutSessionInputSchema.omit(urlFields)

export const customerBillingProductCheckoutSessionInputSchema = z
  .discriminatedUnion('anonymous', [
    customerBillingIdentifiedProductCheckoutSessionInputSchema,
    customerBillingAnonymousProductCheckoutSessionInputSchema,
  ])
  .meta({ id: 'CustomerBillingProductCheckoutSession' })

export const customerBillingActivateSubscriptionCheckoutSessionInputSchema =
  activateSubscriptionCheckoutSessionInputSchema.omit(urlFields)

export const customerBillingCreatePricedCheckoutSessionInputSchema =
  z.discriminatedUnion('type', [
    customerBillingProductCheckoutSessionInputSchema,
    customerBillingActivateSubscriptionCheckoutSessionInputSchema,
  ])

const createCheckoutSessionObject = z
  .discriminatedUnion('type', [
    productCheckoutSessionInputSchema,
    activateSubscriptionCheckoutSessionInputSchema,
    addPaymentMethodCheckoutSessionInputSchema,
  ])
  .meta({ id: 'CreateCheckoutSessionInput' })

export type CreateCheckoutSessionObject = z.infer<
  typeof createCheckoutSessionObject
>

export const singleCheckoutSessionOutputSchema = z.object({
  checkoutSession: checkoutSessionClientSelectSchema,
  url: z
    .string()
    .describe('The URL to redirect to complete the purchase'),
})

export const createCheckoutSessionInputSchema = z
  /*
    If the session is Product and 'anonymous' is missing, set it to false
    before validating. This ensures the discriminated union on 'anonymous'
    can parse. Other session types are unchanged.
  */
  .preprocess(
    (val) => {
      const valueWithCheckoutSession = val as any
      const checkoutSession =
        valueWithCheckoutSession?.checkoutSession
      if (
        checkoutSession?.type === CheckoutSessionType.Product &&
        checkoutSession.anonymous === undefined
      ) {
        return {
          ...valueWithCheckoutSession,
          checkoutSession: { ...checkoutSession, anonymous: false },
        }
      }
      return valueWithCheckoutSession
    },
    z.object({
      checkoutSession: createCheckoutSessionObject,
    })
  )
  .describe('Use this schema for new checkout sessions.')

export type CreateCheckoutSessionInput = z.infer<
  typeof createCheckoutSessionInputSchema
>
