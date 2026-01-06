import type { NextRequest } from 'next/server'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Invoice } from '@/db/schema/invoices'
import type { Payment } from '@/db/schema/payments'
import type { Purchase } from '@/db/schema/purchases'
import {
  isCheckoutSessionSubscriptionCreating,
  selectCheckoutSessionById,
  selectCheckoutSessions,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'
import { generateInvoicePdfIdempotently } from '@/trigger/generate-invoice-pdf'
import { generatePaymentReceiptPdfIdempotently } from '@/trigger/generate-receipt-pdf'
import { processNonPaymentCheckoutSession } from '@/utils/bookkeeping/processNonPaymentCheckoutSession'
import { processPaymentIntentStatusUpdated } from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import { processSetupIntentSucceeded } from '@/utils/bookkeeping/processSetupIntent'
import { deleteCheckoutSessionCookie } from '@/utils/checkoutSessionState'
import { isNil } from '@/utils/core'
import {
  getPaymentIntent,
  getSetupIntent,
  IntentMetadataType,
  stripeIntentMetadataSchema,
} from '@/utils/stripe'

interface ProcessPostPaymentResult {
  purchase: Purchase.Record
  invoice: Invoice.Record
  payment: Payment.Record | null
  checkoutSession: CheckoutSession.Record
  url: string | URL
}

interface ProcessPaymentIntentParams {
  paymentIntentId: string
  request: NextRequest
}

const processPaymentIntent = async ({
  paymentIntentId,
  request,
}: ProcessPaymentIntentParams): Promise<ProcessPostPaymentResult> => {
  const paymentIntent = await getPaymentIntent(paymentIntentId)
  if (!paymentIntent) {
    throw new Error(`Payment intent not found: ${paymentIntentId}`)
  }
  const { payment, purchase, invoice, checkoutSession } =
    await comprehensiveAdminTransaction(async ({ transaction }) => {
      const paymentResult = await processPaymentIntentStatusUpdated(
        paymentIntent,
        transaction
      )
      const {
        result: { payment },
        eventsToInsert,
        ledgerCommand,
      } = paymentResult
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
      } else {
        const checkoutSessionsForPaymentIntent =
          await selectCheckoutSessions(
            {
              stripePaymentIntentId: paymentIntentId,
            },
            transaction
          )
        checkoutSession = checkoutSessionsForPaymentIntent[0]
        if (!checkoutSession) {
          throw new Error(
            `Post-payment: Checkout session not found for payment intent: ${paymentIntentId}`
          )
        }
      }
      return {
        result: { payment, purchase, checkoutSession, invoice },
        eventsToInsert,
        ledgerCommand,
      }
    })
  return {
    purchase,
    invoice,
    payment,
    checkoutSession,
    url: checkoutSession?.successUrl
      ? new URL(checkoutSession.successUrl)
      : new URL(
          `/checkout/${checkoutSession.id}/success`,
          request.url
        ),
  }
}

interface ProcessCheckoutSessionResult
  extends ProcessPostPaymentResult {
  checkoutSession: CheckoutSession.Record
}

interface ProcessCheckoutSessionParams {
  checkoutSessionId: string
  request: NextRequest
}

const processCheckoutSession = async ({
  checkoutSessionId,
  request,
}: ProcessCheckoutSessionParams): Promise<ProcessCheckoutSessionResult> => {
  const result = await comprehensiveAdminTransaction(
    async ({ transaction }) => {
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
        result: {
          checkoutSession,
          purchase: result.result.purchase,
          invoice: result.result.invoice,
        },
        eventsToInsert: result.eventsToInsert,
        ledgerCommand: result.ledgerCommand,
      }
    }
  )

  /**
   * If the purchase session has a success url, redirect to it.
   * Otherwise, redirect to the purchase access page.
   */
  const url = result.checkoutSession.successUrl
    ? new URL(result.checkoutSession.successUrl)
    : new URL(
        `/checkout/${result.checkoutSession.id}/success`,
        request.url
      )

  return {
    checkoutSession: result.checkoutSession,
    purchase: result.purchase,
    url,
    invoice: result.invoice,
    payment: null,
  }
}

interface ProcessSetupIntentParams {
  setupIntentId: string
  request: NextRequest
}

const processSetupIntent = async ({
  setupIntentId,
  request,
}: ProcessSetupIntentParams): Promise<{
  purchase: Purchase.Record | null
  url: string | URL
  checkoutSession: CheckoutSession.Record
}> => {
  const setupIntent = await getSetupIntent(setupIntentId)
  const setupSuceededResult = await comprehensiveAdminTransaction(
    async ({ transaction }) => {
      return processSetupIntentSucceeded(setupIntent, transaction)
    }
  )

  const { purchase, checkoutSession, type } = setupSuceededResult
  if (
    isCheckoutSessionSubscriptionCreating(checkoutSession) &&
    setupSuceededResult.billingRun?.id
  ) {
    const { billingRun } = setupSuceededResult
    await executeBillingRun(billingRun.id)
  }

  const url = checkoutSession.successUrl
    ? new URL(checkoutSession.successUrl)
    : new URL(`/checkout/${checkoutSession.id}/success`, request.url)
  return { purchase, url, checkoutSession }
}

/**
 * This route is built on a very important assumption:
 * that all payment intents and setup intents, regardless of the flow that
 * originated them, have a corresponding Flowglad checkout session.
 * If this route is ever accessed via a payment intent or setup intent that
 * has no backing checkout session - it will crash. But also, that should never happen.
 *
 * The only code paths that create Stripe intents set this route as redirect.
 * And those codepaths all require (or should require) a checkoutSession.
 * @param request
 * @returns
 */
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
      purchase: Purchase.Record | null
      url: string | URL
      checkoutSession: CheckoutSession.Record
    }

    if (checkoutSessionId) {
      const checkoutSessionResult = await processCheckoutSession({
        checkoutSessionId,
        request,
      })
      const { invoice, payment } = checkoutSessionResult
      result = checkoutSessionResult
      await generateInvoicePdfIdempotently(invoice.id)
      if (payment) {
        await generatePaymentReceiptPdfIdempotently(payment.id)
      }
    } else if (paymentIntentId) {
      const paymentIntentResult = await processPaymentIntent({
        paymentIntentId,
        request,
      })
      const { invoice, payment } = paymentIntentResult
      result = paymentIntentResult
      await generateInvoicePdfIdempotently(invoice.id)
      if (payment) {
        await generatePaymentReceiptPdfIdempotently(payment.id)
      }
    } else if (setupIntentId) {
      const setupIntentResult = await processSetupIntent({
        setupIntentId,
        request,
      })
      result = setupIntentResult
    } else {
      throw new Error(
        'post-payment: No payment_intent, setup_intent, or purchase_session id provided'
      )
    }

    const { purchase } = result

    let url = result.url
    if (isNil(url) && result.checkoutSession) {
      url = new URL(
        `/checkout/${result.checkoutSession.id}/success`,
        request.url
      )
    }

    /**
     * Some setup intent flows don't create purchases (e.g., AddPaymentMethod,
     * ActivateSubscription, terminal checkout sessions). Only run purchase-specific
     * logic when a purchase exists.
     */
    if (purchase) {
      const priceId = purchase.priceId
      const priceResult = await adminTransaction(
        async ({ transaction }) => {
          const rows =
            await selectPriceProductAndOrganizationByPriceWhere(
              {
                id: priceId,
              },
              transaction
            )
          return rows[0] ?? null
        }
      )

      /**
       * As the purchase session cookie is no longer needed, delete it.
       * Skip if the price/product lookup fails (data inconsistency).
       */
      if (priceResult) {
        await deleteCheckoutSessionCookie({
          purchaseId: purchase.id,
          productId: priceResult.product.id,
        })
      }
    }

    return Response.redirect(url, 303)
  } catch (error) {
    console.error('Error in post-payment route:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
