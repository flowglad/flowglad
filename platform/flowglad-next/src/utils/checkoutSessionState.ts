import { cookies } from 'next/headers'
import { z } from 'zod'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import { Price } from '@/db/schema/prices'
import type { Purchase } from '@/db/schema/purchases'
import {
  insertCheckoutSession,
  selectCheckoutSessions,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { idInputSchema } from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PriceType,
} from '@/types'
import {
  createPaymentIntentForCheckoutSession,
  createPaymentIntentForInvoiceCheckoutSession,
  createSetupIntentForCheckoutSession,
} from '@/utils/stripe'
import core from './core'

const productCheckoutSessionCookieNameParamsSchema = z.object({
  type: z.literal('product'),
  productId: z.string(),
})

const purchaseCheckoutSessionCookieNameParamsSchema = z.object({
  type: z.literal('purchase'),
  purchaseId: z.string(),
})

const invoiceCheckoutSessionCookieNameParamsSchema = z.object({
  type: z.literal('invoice'),
  invoiceId: z.string(),
})
/**
 * SUBTLE CODE ALERT:
 * The order of z.union matters here!
 *
 * We want to prioritize the purchase id over the price id,
 * so that we can delete the purchase session cookie when the purchase is confirmed.
 * z.union is like "or" in natural language:
 * If you pass it an object with both a purchaseId and a priceId,
 * it will choose the purchaseId and OMIT the priceId.
 *
 * We actually want this because open purchases are more strict versions than prices
 *
 */
export const checkoutSessionCookieNameParamsSchema =
  z.discriminatedUnion('type', [
    purchaseCheckoutSessionCookieNameParamsSchema,
    productCheckoutSessionCookieNameParamsSchema,
    invoiceCheckoutSessionCookieNameParamsSchema,
  ])

export const setCheckoutSessionCookieParamsSchema = idInputSchema.and(
  checkoutSessionCookieNameParamsSchema
)

export type ProductCheckoutSessionCookieNameParams = z.infer<
  typeof productCheckoutSessionCookieNameParamsSchema
>

export type PurchaseCheckoutSessionCookieNameParams = z.infer<
  typeof purchaseCheckoutSessionCookieNameParamsSchema
>

export type CheckoutSessionCookieNameParams = z.infer<
  typeof checkoutSessionCookieNameParamsSchema
>

const checkoutSessionName = (
  params: CheckoutSessionCookieNameParams
) => {
  const base = 'checkout-session-id-'
  switch (params.type) {
    case CheckoutSessionType.Product:
      return base + params.productId
    case CheckoutSessionType.Purchase:
      return base + params.purchaseId
    case CheckoutSessionType.Invoice:
      return base + params.invoiceId
    default:
      throw new Error('Invalid purchase session type: ' + params.type)
  }
}

/**
 * We must support multiple purchase session cookies on the client,
 * one for each price. Otherwise, the client will not be able to
 * tell which purchase session corresponds to which price.
 *
 * Purchase sessions are used to manage the state
 * between the checkout and the purchase confirmation pages.
 */
export const getCheckoutSessionCookie = async (
  params: CheckoutSessionCookieNameParams
) => {
  return (await cookies()).get(checkoutSessionName(params))?.value
}

export const findCheckoutSession = async (
  params: CheckoutSessionCookieNameParams,
  transaction: DbTransaction
): Promise<CheckoutSession.Record | null> => {
  const checkoutSessionId = await getCheckoutSessionCookie(params)

  if (!checkoutSessionId) {
    return null
  }

  const sessions = await selectCheckoutSessions(
    { id: checkoutSessionId },
    transaction
  )

  if (sessions[0].expires && sessions[0].expires < Date.now()) {
    return null
  }

  return sessions[0]
}

export const findPurchaseCheckoutSession = async (
  purchaseId: string,
  transaction: DbTransaction
) => {
  return findCheckoutSession(
    { purchaseId, type: CheckoutSessionType.Purchase },
    transaction
  )
}

export const findProductCheckoutSession = async (
  productId: string,
  transaction: DbTransaction
) => {
  return findCheckoutSession(
    { productId, type: CheckoutSessionType.Product },
    transaction
  )
}
export const findInvoiceCheckoutSession = async (
  invoiceId: string,
  transaction: DbTransaction
) => {
  return findCheckoutSession(
    { invoiceId, type: CheckoutSessionType.Invoice },
    transaction
  )
}

interface CreateNonInvoiceCheckoutSessionBaseParams {
  price: Price.Record
  organizationId: string
}

interface CreatePurchaseCheckoutSessionParams
  extends CreateNonInvoiceCheckoutSessionBaseParams {
  purchase?: Purchase.Record
  targetSubscriptionId?: never
  customerId?: never
}

interface CreateAddPaymentMethodCheckoutSessionParams
  extends CreateNonInvoiceCheckoutSessionBaseParams {
  purchase?: never
  targetSubscriptionId: string
  customerId: string
}

type CreateNonInvoiceCheckoutSessionParams =
  | CreatePurchaseCheckoutSessionParams
  | CreateAddPaymentMethodCheckoutSessionParams

export const createNonInvoiceCheckoutSession = async (
  {
    price,
    purchase,
    organizationId,
    targetSubscriptionId,
    customerId,
  }: CreateNonInvoiceCheckoutSessionParams,
  transaction: DbTransaction
) => {
  const checkoutSessionInsertCore = {
    priceId: price.id,
    status: CheckoutSessionStatus.Open,
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24).getTime(), // 24 hours
    organizationId,
    livemode: price.livemode,
    productId: price.productId,
    pricingModelId: price.pricingModelId,
  } as const

  let checkoutSessionInsert: CheckoutSession.Insert = {
    ...checkoutSessionInsertCore,
    invoiceId: null,
    type: CheckoutSessionType.Product,
    /**
     * Assume defaults for no-code checkout sessions
     */
    targetSubscriptionId: null,
    automaticallyUpdateSubscriptions: null,
    preserveBillingCycleAnchor: false,
  }
  if (purchase) {
    checkoutSessionInsert = {
      ...checkoutSessionInsertCore,
      purchaseId: purchase.id,
      invoiceId: null,
      type: CheckoutSessionType.Purchase,
      targetSubscriptionId: null,
      automaticallyUpdateSubscriptions: null,
    }
  } else if (targetSubscriptionId) {
    checkoutSessionInsert = {
      ...checkoutSessionInsertCore,
      customerId,
      targetSubscriptionId,
      type: CheckoutSessionType.AddPaymentMethod,
      automaticallyUpdateSubscriptions: false,
    }
  }

  // FIXME: PR 3 - Product lookup and validation only applies to non-usage prices.
  // Usage prices don't have productId. Product is needed for:
  // 1. Validating not a default product
  // 2. Creating payment intents for single payment prices
  let product = null
  if (Price.hasProductId(price)) {
    product = await selectProductById(price.productId, transaction)
    if (product.default) {
      throw new Error(
        'Checkout sessions cannot be created for default products. Default products are automatically assigned to customers and do not require manual checkout.'
      )
    }
  }

  const checkoutSession = await insertCheckoutSession(
    checkoutSessionInsert,
    transaction
  )
  const organization = await selectOrganizationById(
    organizationId,
    transaction
  )

  let stripeSetupIntentId: string | null = null
  let stripePaymentIntentId: string | null = null
  /**
   * Only attempt to create intents if:
   * - It's not livemode
   * - It's livemode AND payouts are enabled
   */
  if (!checkoutSession.livemode || organization.payoutsEnabled) {
    if (
      price.type === PriceType.Subscription ||
      price.type === PriceType.Usage
    ) {
      const customer = customerId
        ? await selectCustomerById(customerId, transaction)
        : undefined
      const setupIntent = await createSetupIntentForCheckoutSession({
        organization,
        checkoutSession,
        purchase,
        customer,
      })
      stripeSetupIntentId = setupIntent.id
    } else {
      // SinglePayment prices always have a product, so product should never be null here
      if (!product) {
        throw new Error(
          `Product is required for single payment checkout session but was null for price ${price.id}`
        )
      }
      const paymentIntent =
        await createPaymentIntentForCheckoutSession({
          price,
          product,
          purchase,
          checkoutSession,
          organization,
        })
      stripePaymentIntentId = paymentIntent.id
    }
  }

  const updatedCheckoutSession = await updateCheckoutSession(
    {
      ...checkoutSession,
      stripePaymentIntentId,
      stripeSetupIntentId,
    },
    transaction
  )

  return updatedCheckoutSession
}

export const findOrCreateCheckoutSession = async (
  {
    productId,
    organizationId,
    price,
    purchase,
    type,
  }: {
    productId: string
    organizationId: string
    price: Price.Record
    purchase?: Purchase.Record
    type: CheckoutSessionType.Product | CheckoutSessionType.Purchase
  },
  transaction: DbTransaction
) => {
  const checkoutSession = await findCheckoutSession(
    {
      productId: productId,
      purchaseId: purchase?.id,
      type,
    } as CheckoutSessionCookieNameParams,
    transaction
  )
  if (
    core.isNil(checkoutSession) ||
    checkoutSession.priceId !== price.id
  ) {
    return createNonInvoiceCheckoutSession(
      {
        price,
        organizationId,
        purchase,
        targetSubscriptionId: undefined,
        customerId: undefined,
      },
      transaction
    )
  }
  return checkoutSession
}

const createInvoiceCheckoutSession = async (
  {
    invoice,
    invoiceLineItems,
    feeCalculation,
  }: {
    invoice: Invoice.Record
    invoiceLineItems: InvoiceLineItem.Record[]
    feeCalculation?: FeeCalculation.Record
  },
  transaction: DbTransaction
) => {
  const customer = await selectCustomerById(
    invoice.customerId,
    transaction
  )
  const checkoutSession = await insertCheckoutSession(
    {
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Invoice,
      invoiceId: invoice.id,
      organizationId: invoice.organizationId,
      customerId: invoice.customerId,
      customerEmail: customer.email,
      customerName: customer.name,
      livemode: invoice.livemode,
      purchaseId: null,
      priceId: null,
      outputMetadata: null,
      targetSubscriptionId: null,
      automaticallyUpdateSubscriptions: null,
      pricingModelId: invoice.pricingModelId,
    },
    transaction
  )
  const organization = await selectOrganizationById(
    invoice.organizationId,
    transaction
  )
  const paymentIntent =
    await createPaymentIntentForInvoiceCheckoutSession({
      invoice,
      organization,
      checkoutSession,
      invoiceLineItems: invoiceLineItems,
      feeCalculation: feeCalculation,
      stripeCustomerId: customer.stripeCustomerId!,
    })
  const updatedCheckoutSession = await updateCheckoutSession(
    {
      ...checkoutSession,
      stripePaymentIntentId: paymentIntent.id,
    },
    transaction
  )
  return updatedCheckoutSession
}

export const findOrCreateInvoiceCheckoutSession = async (
  {
    invoice,
    invoiceLineItems,
    feeCalculation,
  }: {
    invoice: Invoice.Record
    invoiceLineItems: InvoiceLineItem.Record[]
    feeCalculation?: FeeCalculation.Record
  },
  transaction: DbTransaction
) => {
  const checkoutSession = await findCheckoutSession(
    {
      invoiceId: invoice.id,
      type: CheckoutSessionType.Invoice,
    },
    transaction
  )
  if (checkoutSession) {
    return checkoutSession
  }

  return createInvoiceCheckoutSession(
    { invoice, invoiceLineItems, feeCalculation },
    transaction
  )
}

type SetCheckoutSessionCookieParams = {
  id: string
} & CheckoutSessionCookieNameParams

export const setCheckoutSessionCookie = async (
  params: SetCheckoutSessionCookieParams
) => {
  const { id } = params
  return (await cookies()).set(checkoutSessionName(params), id, {
    maxAge: 60 * 60 * 24, // 24 hours
  })
}

/**
 * Attempt to delete the purchase session cookie for each of the given params.
 * This strategy ensures we delete price id
 * @param params
 */
export const deleteCheckoutSessionCookie = async (params: {
  productId?: string
  purchaseId?: string
  invoiceId?: string
}) => {
  const cookieStore = await cookies()
  if ('productId' in params && params.productId) {
    await cookieStore.delete(
      checkoutSessionName({
        productId: params.productId,
        type: CheckoutSessionType.Product,
      })
    )
  }
  if ('purchaseId' in params && params.purchaseId) {
    await cookieStore.delete(
      checkoutSessionName({
        purchaseId: params.purchaseId,
        type: CheckoutSessionType.Purchase,
      })
    )
  }

  if ('invoiceId' in params && params.invoiceId) {
    await cookieStore.delete(
      checkoutSessionName({
        invoiceId: params.invoiceId,
        type: CheckoutSessionType.Invoice,
      })
    )
  }
}
