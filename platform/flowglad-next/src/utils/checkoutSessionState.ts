import { Variant } from '@/db/schema/variants'
import { cookies } from 'next/headers'
import {
  selectCheckoutSessions,
  insertCheckoutSession,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import {
  createPaymentIntentForInvoiceCheckoutSession,
  createPaymentIntentForCheckoutSession,
  createSetupIntentForCheckoutSession,
} from '@/utils/stripe'
import {
  PriceType,
  CheckoutSessionStatus,
  CheckoutSessionType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { Purchase } from '@/db/schema/purchases'

import { z } from 'zod'
import { idInputSchema } from '@/db/tableUtils'
import core from './core'
import { Invoice } from '@/db/schema/invoices'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'

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
 * We want to prioritize the purchase id over the variant id,
 * so that we can delete the purchase session cookie when the purchase is confirmed.
 * z.union is like "or" in natural language:
 * If you pass it an object with both a purchaseId and a variantId,
 * it will choose the purchaseId and OMIT the variantId.
 *
 * We actually want this because open purchases are more strict versions than variants
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
 * one for each variant. Otherwise, the client will not be able to
 * tell which purchase session corresponds to which variant.
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

  if (sessions[0].expires && sessions[0].expires < new Date()) {
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

export const createNonInvoiceCheckoutSession = async (
  {
    variant,
    purchase,
    organizationId,
  }: {
    variant: Variant.Record
    purchase?: Purchase.Record
    organizationId: string
  },
  transaction: DbTransaction
) => {
  const checkoutSessionInsertCore = {
    variantId: variant.id,
    status: CheckoutSessionStatus.Open,
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours
    organizationId,
    livemode: variant.livemode,
    productId: variant.productId,
  } as const

  const purchaseSesionInsert: CheckoutSession.Insert = purchase
    ? {
        ...checkoutSessionInsertCore,
        purchaseId: purchase.id,
        invoiceId: null,
        type: CheckoutSessionType.Purchase,
      }
    : {
        ...checkoutSessionInsertCore,
        invoiceId: null,
        type: CheckoutSessionType.Product,
      }

  const checkoutSession = await insertCheckoutSession(
    purchaseSesionInsert,
    transaction
  )
  const organization = await selectOrganizationById(
    organizationId,
    transaction
  )
  const product = await selectProductById(
    variant.productId,
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
    if (variant.priceType === PriceType.Subscription) {
      const setupIntent = await createSetupIntentForCheckoutSession({
        variant,
        product,
        organization,
        checkoutSession,
        purchase,
      })
      stripeSetupIntentId = setupIntent.id
    } else {
      const paymentIntent =
        await createPaymentIntentForCheckoutSession({
          variant,
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
    variant,
    purchase,
    type,
  }: {
    productId: string
    organizationId: string
    variant: Variant.Record
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
    checkoutSession.variantId !== variant.id
  ) {
    return createNonInvoiceCheckoutSession(
      { variant, organizationId, purchase },
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
  const customerProfile = await selectCustomerProfileById(
    invoice.customerProfileId,
    transaction
  )
  const checkoutSession = await insertCheckoutSession(
    {
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Invoice,
      invoiceId: invoice.id,
      organizationId: invoice.organizationId,
      customerProfileId: invoice.customerProfileId,
      customerEmail: customerProfile.email,
      customerName: customerProfile.name,
      livemode: invoice.livemode,
      purchaseId: null,
      variantId: null,
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
      stripeCustomerId: customerProfile.stripeCustomerId!,
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
 * This strategy ensures we delete variant id
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
