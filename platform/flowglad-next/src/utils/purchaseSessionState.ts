import { Variant } from '@/db/schema/variants'
import { cookies } from 'next/headers'
import {
  selectPurchaseSessions,
  insertPurchaseSession,
  updatePurchaseSession,
} from '@/db/tableMethods/purchaseSessionMethods'
import {
  createPaymentIntentForInvoicePurchaseSession,
  createPaymentIntentForPurchaseSession,
  createSetupIntentForPurchaseSession,
} from '@/utils/stripe'
import {
  PriceType,
  PurchaseSessionStatus,
  PurchaseSessionType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { PurchaseSession } from '@/db/schema/purchaseSessions'
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

const productPurchaseSessionCookieNameParamsSchema = z.object({
  type: z.literal('product'),
  productId: z.string(),
})

const purchasePurchaseSessionCookieNameParamsSchema = z.object({
  type: z.literal('purchase'),
  purchaseId: z.string(),
})

const invoicePurchaseSessionCookieNameParamsSchema = z.object({
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
export const purchaseSessionCookieNameParamsSchema =
  z.discriminatedUnion('type', [
    purchasePurchaseSessionCookieNameParamsSchema,
    productPurchaseSessionCookieNameParamsSchema,
    invoicePurchaseSessionCookieNameParamsSchema,
  ])

export const setPurchaseSessionCookieParamsSchema = idInputSchema.and(
  purchaseSessionCookieNameParamsSchema
)

export type ProductPurchaseSessionCookieNameParams = z.infer<
  typeof productPurchaseSessionCookieNameParamsSchema
>

export type PurchasePurchaseSessionCookieNameParams = z.infer<
  typeof purchasePurchaseSessionCookieNameParamsSchema
>

export type PurchaseSessionCookieNameParams = z.infer<
  typeof purchaseSessionCookieNameParamsSchema
>

const purchaseSessionName = (
  params: PurchaseSessionCookieNameParams
) => {
  const base = 'purchase-session-id-'
  switch (params.type) {
    case PurchaseSessionType.Product:
      return base + params.productId
    case PurchaseSessionType.Purchase:
      return base + params.purchaseId
    case PurchaseSessionType.Invoice:
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
export const getPurchaseSessionCookie = (
  params: PurchaseSessionCookieNameParams
) => {
  return cookies().get(purchaseSessionName(params))?.value
}

export const findPurchaseSession = async (
  params: PurchaseSessionCookieNameParams,
  transaction: DbTransaction
): Promise<PurchaseSession.Record | null> => {
  const purchaseSessionId = getPurchaseSessionCookie(params)

  if (!purchaseSessionId) {
    return null
  }

  const sessions = await selectPurchaseSessions(
    { id: purchaseSessionId },
    transaction
  )

  if (sessions[0].expires && sessions[0].expires < new Date()) {
    return null
  }

  return sessions[0]
}

export const findPurchasePurchaseSession = async (
  purchaseId: string,
  transaction: DbTransaction
) => {
  return findPurchaseSession(
    { purchaseId, type: PurchaseSessionType.Purchase },
    transaction
  )
}

export const findProductPurchaseSession = async (
  productId: string,
  transaction: DbTransaction
) => {
  return findPurchaseSession(
    { productId, type: PurchaseSessionType.Product },
    transaction
  )
}
export const findInvoicePurchaseSession = async (
  invoiceId: string,
  transaction: DbTransaction
) => {
  return findPurchaseSession(
    { invoiceId, type: PurchaseSessionType.Invoice },
    transaction
  )
}

export const createNonInvoicePurchaseSession = async (
  {
    variant,
    purchase,
    OrganizationId,
  }: {
    variant: Variant.Record
    purchase?: Purchase.Record
    OrganizationId: string
  },
  transaction: DbTransaction
) => {
  const purchaseSessionInsertCore = {
    VariantId: variant.id,
    status: PurchaseSessionStatus.Open,
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours
    OrganizationId,
    livemode: variant.livemode,
    ProductId: variant.ProductId,
  } as const

  const purchaseSesionInsert: PurchaseSession.Insert = purchase
    ? {
        ...purchaseSessionInsertCore,
        PurchaseId: purchase.id,
        InvoiceId: null,
        type: PurchaseSessionType.Purchase,
      }
    : {
        ...purchaseSessionInsertCore,
        InvoiceId: null,
        type: PurchaseSessionType.Product,
      }

  const purchaseSession = await insertPurchaseSession(
    purchaseSesionInsert,
    transaction
  )
  const organization = await selectOrganizationById(
    OrganizationId,
    transaction
  )
  const product = await selectProductById(
    variant.ProductId,
    transaction
  )

  let stripeSetupIntentId: string | null = null
  let stripePaymentIntentId: string | null = null
  /**
   * Only attempt to create intents if:
   * - It's not livemode
   * - It's livemode AND payouts are enabled
   */
  if (!purchaseSession.livemode || organization.payoutsEnabled) {
    if (variant.priceType === PriceType.Subscription) {
      const setupIntent = await createSetupIntentForPurchaseSession({
        variant,
        product,
        organization,
        purchaseSession,
        purchase,
      })
      stripeSetupIntentId = setupIntent.id
    } else {
      const paymentIntent =
        await createPaymentIntentForPurchaseSession({
          variant,
          product,
          purchase,
          purchaseSession,
          organization,
        })
      stripePaymentIntentId = paymentIntent.id
    }
  }

  const updatedPurchaseSession = await updatePurchaseSession(
    {
      ...purchaseSession,
      stripePaymentIntentId,
      stripeSetupIntentId,
    },
    transaction
  )

  return updatedPurchaseSession
}

export const findOrCreatePurchaseSession = async (
  {
    ProductId,
    OrganizationId,
    variant,
    purchase,
    type,
  }: {
    ProductId: string
    OrganizationId: string
    variant: Variant.Record
    purchase?: Purchase.Record
    type: PurchaseSessionType.Product | PurchaseSessionType.Purchase
  },
  transaction: DbTransaction
) => {
  const purchaseSession = await findPurchaseSession(
    {
      productId: ProductId,
      purchaseId: purchase?.id,
      type,
    } as PurchaseSessionCookieNameParams,
    transaction
  )
  if (
    core.isNil(purchaseSession) ||
    purchaseSession.VariantId !== variant.id
  ) {
    return createNonInvoicePurchaseSession(
      { variant, OrganizationId, purchase },
      transaction
    )
  }
  return purchaseSession
}

const createInvoicePurchaseSession = async (
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
    invoice.CustomerProfileId,
    transaction
  )
  const purchaseSession = await insertPurchaseSession(
    {
      status: PurchaseSessionStatus.Open,
      type: PurchaseSessionType.Invoice,
      InvoiceId: invoice.id,
      OrganizationId: invoice.OrganizationId,
      CustomerProfileId: invoice.CustomerProfileId,
      customerEmail: customerProfile.email,
      customerName: customerProfile.name,
      livemode: invoice.livemode,
      PurchaseId: null,
      VariantId: null,
    },
    transaction
  )
  const organization = await selectOrganizationById(
    invoice.OrganizationId,
    transaction
  )
  const paymentIntent =
    await createPaymentIntentForInvoicePurchaseSession({
      invoice,
      organization,
      purchaseSession,
      invoiceLineItems: invoiceLineItems,
      feeCalculation: feeCalculation,
      stripeCustomerId: customerProfile.stripeCustomerId!,
    })
  const updatedPurchaseSession = await updatePurchaseSession(
    {
      ...purchaseSession,
      stripePaymentIntentId: paymentIntent.id,
    },
    transaction
  )
  return updatedPurchaseSession
}

export const findOrCreateInvoicePurchaseSession = async (
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
  const purchaseSession = await findPurchaseSession(
    {
      invoiceId: invoice.id,
      type: PurchaseSessionType.Invoice,
    },
    transaction
  )
  if (purchaseSession) {
    return purchaseSession
  }

  return createInvoicePurchaseSession(
    { invoice, invoiceLineItems, feeCalculation },
    transaction
  )
}

type SetPurchaseSessionCookieParams = {
  id: string
} & PurchaseSessionCookieNameParams

export const setPurchaseSessionCookie = async (
  params: SetPurchaseSessionCookieParams
) => {
  const { id } = params
  return (await cookies()).set(purchaseSessionName(params), id, {
    maxAge: 60 * 60 * 24, // 24 hours
  })
}

/**
 * Attempt to delete the purchase session cookie for each of the given params.
 * This strategy ensures we delete variant id
 * @param params
 */
export const deletePurchaseSessionCookie = async (params: {
  productId?: string
  purchaseId?: string
  invoiceId?: string
}) => {
  const cookieStore = await cookies()
  if ('productId' in params && params.productId) {
    await cookieStore.delete(
      purchaseSessionName({
        productId: params.productId,
        type: PurchaseSessionType.Product,
      })
    )
  }
  if ('purchaseId' in params && params.purchaseId) {
    await cookieStore.delete(
      purchaseSessionName({
        purchaseId: params.purchaseId,
        type: PurchaseSessionType.Purchase,
      })
    )
  }

  if ('invoiceId' in params && params.invoiceId) {
    await cookieStore.delete(
      purchaseSessionName({
        invoiceId: params.invoiceId,
        type: PurchaseSessionType.Invoice,
      })
    )
  }
}
