import { adminTransaction } from '@/db/adminTransaction'
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
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { Purchase } from '@/db/schema/purchases'
import { deleteCheckoutSessionCookie } from '@/utils/checkoutSessionState'
import {
  selectCheckoutSessionById,
  selectCheckoutSessions,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { processNonPaymentCheckoutSession } from '@/utils/bookkeeping/processNonPaymentCheckoutSession'
import { processPaymentIntentStatusUpdated } from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import { isNil } from '@/utils/core'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import {
  generateInvoicePdfIdempotently,
  generateInvoicePdfTask,
} from '@/trigger/generate-invoice-pdf'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'
import { Invoice } from '@/db/schema/invoices'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'
import { Payment } from '@/db/schema/payments'

interface ProcessPostPaymentResult {
  purchase: Purchase.Record
  invoice: Invoice.Record
  payment: Payment.Record | null
  url: string | URL | null
}

const processPaymentIntent = async (
  paymentIntentId: string
): Promise<ProcessPostPaymentResult> => {
  const paymentIntent = await getPaymentIntent(paymentIntentId)
  if (!paymentIntent) {
    throw new Error(`Payment intent not found: ${paymentIntentId}`)
  }
  const { payment, purchase, invoice, checkoutSession } =
    await adminTransaction(async ({ transaction }) => {
      const { payment } = await processPaymentIntentStatusUpdated(
        paymentIntent,
        transaction
      )
      if (!payment.purchaseId) {
        throw new Error(
          `No purchase id found for payment ${payment.id}`
        )
      }
      const purchase = await selectPurchaseById(
        payment.purchaseId,
        transaction
      )
      const invoice = await selectInvoiceById(
        payment.invoiceId,
        transaction
      )
      const metadata = stripeIntentMetadataSchema.parse(
        paymentIntent.metadata
      )
      let checkoutSession: CheckoutSession.Record | null = null
      if (metadata?.type === IntentMetadataType.CheckoutSession) {
        checkoutSession = await selectCheckoutSessionById(
          metadata.checkoutSessionId,
          transaction
        )
      }
      return { payment, purchase, checkoutSession, invoice }
    })
  return {
    purchase,
    invoice,
    payment,
    url: checkoutSession?.successUrl
      ? new URL(checkoutSession.successUrl)
      : null,
  }
}

const processCheckoutSession = async (
  checkoutSessionId: string
): Promise<ProcessPostPaymentResult> => {
  const result = await adminTransaction(async ({ transaction }) => {
    const [checkoutSession] = await selectCheckoutSessions(
      {
        id: checkoutSessionId,
      },
      transaction
    )
    if (!checkoutSession) {
      throw new Error(
        `Purchase session not found: ${checkoutSessionId}`
      )
    }
    const result = await processNonPaymentCheckoutSession(
      checkoutSession,
      transaction
    )
    return {
      checkoutSession,
      purchase: result.purchase,
      invoice: result.invoice,
    }
  })

  /**
   * If the purchase session has a success url, redirect to it.
   * Otherwise, redirect to the purchase access page.
   */
  const url = result.checkoutSession.successUrl
    ? new URL(result.checkoutSession.successUrl)
    : null

  return {
    purchase: result.purchase,
    url,
    invoice: result.invoice,
    payment: null,
  }
}

const processSetupIntent = async (
  setupIntentId: string
): Promise<{
  purchase: Purchase.Record | null
  url: string | URL | null
}> => {
  const setupIntent = await getSetupIntent(setupIntentId)
  const { purchase, checkoutSession, billingRun } =
    await adminTransaction(async ({ transaction }) => {
      return processSetupIntentUpdated(setupIntent, transaction)
    })
  if (billingRun) {
    await executeBillingRun(billingRun.id)
  }
  const url = checkoutSession.successUrl
    ? new URL(checkoutSession.successUrl)
    : null
  return { purchase, url }
}

const idempotentGenerateInvoicePdf = async (
  invoiceId: string,
  paymentId?: string
) => {
  return await generateInvoicePdfIdempotently(invoiceId)
}

export const GET = async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams
    const paymentIntentId = searchParams.get('payment_intent')
    const setupIntentId = searchParams.get('setup_intent')
    const checkoutSessionId = searchParams.get('checkout_session')

    if (!paymentIntentId && !setupIntentId && !checkoutSessionId) {
      return new Response(
        'Either payment_intent, setup_intent, or checkout_session is required',
        {
          status: 400,
        }
      )
    }

    let result: {
      purchase: Purchase.Record
      url: string | URL | null
    }

    if (checkoutSessionId) {
      const checkoutSessionResult =
        await processCheckoutSession(checkoutSessionId)
      const { invoice } = checkoutSessionResult
      result = checkoutSessionResult
      await idempotentGenerateInvoicePdf(
        invoice.id,
        checkoutSessionResult.payment?.id
      )
    } else if (paymentIntentId) {
      const paymentIntentResult =
        await processPaymentIntent(paymentIntentId)
      const { invoice } = paymentIntentResult
      result = paymentIntentResult
      await idempotentGenerateInvoicePdf(
        invoice.id,
        paymentIntentResult.payment?.id
      )
    } else if (setupIntentId) {
      const setupIntentResult =
        await processSetupIntent(setupIntentId)
      if (setupIntentResult.url) {
        return Response.redirect(setupIntentResult.url, 303)
      }

      if (!setupIntentResult.purchase) {
        return Response.json(
          {
            success: false,
          },
          {
            status: 400,
          }
        )
      }
      result = setupIntentResult as {
        purchase: Purchase.Record
        url: string | URL | null
      }
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

    const purchaseId = purchase.id
    const priceId = purchase.priceId
    const { product } = await adminTransaction(
      async ({ transaction }) => {
        const [{ product }] =
          await selectPriceProductAndOrganizationByPriceWhere(
            {
              id: priceId,
            },
            transaction
          )
        await createPurchaseAccessSession(
          {
            purchaseId,
            source: PurchaseAccessSessionSource.CheckoutSession,
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
    await deleteCheckoutSessionCookie({
      purchaseId: purchase.id,
      productId: product.id,
    })

    return Response.redirect(url, 303)
  } catch (error) {
    console.error('Error in post-payment route:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
