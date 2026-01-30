import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PriceType,
} from '@db-core/enums'
import type { CheckoutSession } from '@db-core/schema/checkoutSessions'
import { Price } from '@db-core/schema/prices'
import type { Purchase } from '@db-core/schema/purchases'
import { idInputSchema } from '@db-core/tableUtils'
import { Result } from 'better-result'
import { cookies } from 'next/headers'
import { z } from 'zod'
import {
  insertCheckoutSession,
  selectCheckoutSessions,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import type { DbTransaction } from '@/db/types'
import { ValidationError } from '@/errors'
import {
  createPaymentIntentForCheckoutSession,
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
): Promise<Result<CheckoutSession.Record, ValidationError>> => {
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

  // Product lookup and validation only applies to non-usage prices.
  // Usage prices don't have productId. Product is needed for:
  // 1. Validating not a default product
  // 2. Creating payment intents for single payment prices
  let product = null
  if (Price.hasProductId(price)) {
    product = (
      await selectProductById(price.productId, transaction)
    ).unwrap()
    if (product.default) {
      return Result.err(
        new ValidationError(
          'product',
          'Checkout sessions cannot be created for default products. Default products are automatically assigned to customers and do not require manual checkout.'
        )
      )
    }
  }

  const checkoutSessionResult = await insertCheckoutSession(
    checkoutSessionInsert,
    transaction
  )
  if (checkoutSessionResult.status === 'error') {
    return checkoutSessionResult
  }
  const checkoutSession = checkoutSessionResult.value
  const organization = (
    await selectOrganizationById(organizationId, transaction)
  ).unwrap()

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
        ? (await selectCustomerById(customerId, transaction)).unwrap()
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
      const paymentIntentResult =
        await createPaymentIntentForCheckoutSession({
          price,
          product,
          purchase,
          checkoutSession,
          organization,
        })
      if (Result.isError(paymentIntentResult)) {
        return Result.err(paymentIntentResult.error)
      }
      stripePaymentIntentId = paymentIntentResult.value.id
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

  return Result.ok(updatedCheckoutSession)
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
): Promise<Result<CheckoutSession.Record, ValidationError>> => {
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
  return Result.ok(checkoutSession)
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
}
