import { adminTransaction } from '@/db/databaseMethods'
import { PurchaseAccessSessionSource } from '@/types'
import { processSetupIntentUpdated } from '@/utils/bookkeeping/processSetupIntentUpdated'
import { createPurchaseAccessSession } from '@/utils/purchaseAccessSessionState'
import {
  getPaymentIntent,
  getSetupIntent,
  IntentMetadataType,
  stripeIntentMetadataSchema,
} from '@/utils/stripe'
import { NextRequest } from 'next/server'
import { selectVariantProductAndOrganizationByVariantWhere } from '@/db/tableMethods/variantMethods'
import { Purchase } from '@/db/schema/purchases'
import { deletePurchaseSessionCookie } from '@/utils/purchaseSessionState'
import {
  selectPurchaseSessionById,
  selectPurchaseSessions,
} from '@/db/tableMethods/purchaseSessionMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { processNonPaymentPurchaseSession } from '@/utils/bookkeeping/processNonPaymentPurchaseSession'
import { processPaymentIntentStatusUpdated } from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import { isNil } from '@/utils/core'
import { PurchaseSession } from '@/db/schema/purchaseSessions'
import { generateInvoicePdfTask } from '@/trigger/generate-invoice-pdf'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'
import { Invoice } from '@/db/schema/invoices'

interface ProcessPostPaymentResult {
  purchase: Purchase.Record
  invoice: Invoice.Record
  url: string | URL | null
}

const processPaymentIntent = async (
  paymentIntentId: string
): Promise<ProcessPostPaymentResult> => {
  const paymentIntent = await getPaymentIntent(paymentIntentId)
  if (!paymentIntent) {
    throw new Error(`Payment intent not found: ${paymentIntentId}`)
  }
  const result = await adminTransaction(async ({ transaction }) => {
    const { payment } = await processPaymentIntentStatusUpdated(
      paymentIntent,
      transaction
    )
    if (!payment.PurchaseId) {
      throw new Error(
        `No purchase id found for payment ${payment.id}`
      )
    }
    const purchase = await selectPurchaseById(
      payment.PurchaseId,
      transaction
    )
    const invoice = await selectInvoiceById(
      payment.InvoiceId,
      transaction
    )
    const metadata = stripeIntentMetadataSchema.parse(
      paymentIntent.metadata
    )
    let purchaseSession: PurchaseSession.Record | null = null
    if (metadata?.type === IntentMetadataType.PurchaseSession) {
      purchaseSession = await selectPurchaseSessionById(
        metadata.purchaseSessionId,
        transaction
      )
    }
    return { payment, purchase, purchaseSession, invoice }
  })
  return {
    purchase: result.purchase,
    invoice: result.invoice,
    url: result.purchaseSession?.successUrl
      ? new URL(result.purchaseSession.successUrl)
      : null,
  }
}

const processPurchaseSession = async (
  purchaseSessionId: string
): Promise<ProcessPostPaymentResult> => {
  const result = await adminTransaction(async ({ transaction }) => {
    const [purchaseSession] = await selectPurchaseSessions(
      {
        id: purchaseSessionId,
      },
      transaction
    )
    if (!purchaseSession) {
      throw new Error(
        `Purchase session not found: ${purchaseSessionId}`
      )
    }
    const result = await processNonPaymentPurchaseSession(
      purchaseSession,
      transaction
    )
    return {
      purchaseSession,
      purchase: result.purchase,
      invoice: result.invoice,
    }
  })

  /**
   * If the purchase session has a success url, redirect to it.
   * Otherwise, redirect to the purchase access page.
   */
  const url = result.purchaseSession.successUrl
    ? new URL(result.purchaseSession.successUrl)
    : null

  return { purchase: result.purchase, url, invoice: result.invoice }
}

const processSetupIntent = async (
  setupIntentId: string
): Promise<{
  purchase: Purchase.Record
  url: string | URL | null
}> => {
  const setupIntent = await getSetupIntent(setupIntentId)
  const { purchase, purchaseSession } = await adminTransaction(
    async ({ transaction }) => {
      return processSetupIntentUpdated(setupIntent, transaction)
    }
  )
  const url = purchaseSession.successUrl
    ? new URL(purchaseSession.successUrl)
    : null
  return { purchase, url }
}

export const GET = async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams
    const paymentIntentId = searchParams.get('payment_intent')
    const setupIntentId = searchParams.get('setup_intent')
    const purchaseSessionId = searchParams.get('purchase_session')

    if (!paymentIntentId && !setupIntentId && !purchaseSessionId) {
      return new Response(
        'Either payment_intent, setup_intent, or purchase_session is required',
        {
          status: 400,
        }
      )
    }

    let result: {
      purchase: Purchase.Record
      url: string | URL | null
    }

    if (purchaseSessionId) {
      const purchaseSessionResult =
        await processPurchaseSession(purchaseSessionId)
      const { invoice } = purchaseSessionResult
      result = purchaseSessionResult
      await generateInvoicePdfTask.trigger({
        invoiceId: invoice.id,
      })
    } else if (paymentIntentId) {
      const paymentIntentResult =
        await processPaymentIntent(paymentIntentId)
      const { invoice } = paymentIntentResult
      result = paymentIntentResult
      await generateInvoicePdfTask.trigger({
        invoiceId: invoice.id,
      })
    } else if (setupIntentId) {
      result = await processSetupIntent(setupIntentId)
    } else {
      throw new Error(
        'post-payment: No payment_intent, setup_intent, or purchase_session id provided'
      )
    }

    const { purchase } = result

    if (!purchase) {
      return Response.json(
        {
          success: false,
        },
        {
          status: 400,
        }
      )
    }

    let url = result.url
    if (isNil(url)) {
      url = new URL(`/purchase/access/${purchase.id}`, request.url)
    }

    const PurchaseId = purchase.id
    const VariantId = purchase.VariantId
    const { product } = await adminTransaction(
      async ({ transaction }) => {
        const [{ product }] =
          await selectVariantProductAndOrganizationByVariantWhere(
            {
              id: VariantId,
            },
            transaction
          )
        await createPurchaseAccessSession(
          {
            PurchaseId,
            source: PurchaseAccessSessionSource.PurchaseSession,
            autoGrant: true,
            livemode: product.livemode,
          },
          transaction
        )
        return { product }
      }
    )

    /**
     * As the purchase session cookie is no longer needed, delete it.
     */
    await deletePurchaseSessionCookie({
      purchaseId: purchase.id,
      productId: product.id,
    })

    return Response.redirect(url, 303)
  } catch (error) {
    console.error('Error in post-payment route:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
