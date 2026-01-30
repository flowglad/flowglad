import type { CheckoutSession } from '@db-core/schema/checkoutSessions'
import type { Invoice } from '@db-core/schema/invoices'
import type { Payment } from '@db-core/schema/payments'
import type { Purchase } from '@db-core/schema/purchases'
import { Result } from 'better-result'
import type { NextRequest } from 'next/server'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
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
    await comprehensiveAdminTransaction(async (ctx) => {
      const { transaction } = ctx
      const paymentResult = await processPaymentIntentStatusUpdated(
        paymentIntent,
        ctx
      )
      if (paymentResult.status === 'error') {
        return Result.err(paymentResult.error)
      }
      const { payment } = paymentResult.value
      if (!payment.purchaseId) {
        throw new Error(
          `No purchase id found for payment ${payment.id}`
        )
      }
      const purchase = (
        await selectPurchaseById(payment.purchaseId, transaction)
      ).unwrap()
      const invoice = (
        await selectInvoiceById(payment.invoiceId, transaction)
      ).unwrap()
      const metadata = stripeIntentMetadataSchema.parse(
        paymentIntent.metadata
      )
      let checkoutSession: CheckoutSession.Record | null = null
      if (metadata?.type === IntentMetadataType.CheckoutSession) {
        checkoutSession = (
          await selectCheckoutSessionById(
            metadata.checkoutSessionId,
            transaction
          )
        ).unwrap()
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
      return Result.ok({
        payment,
        purchase,
        checkoutSession,
        invoice,
      })
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
    async (params) => {
      const { transaction } = params
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
      const { purchase, invoice } =
        await processNonPaymentCheckoutSession(checkoutSession, {
          transaction,
          cacheRecomputationContext: params.cacheRecomputationContext,
          invalidateCache: params.invalidateCache,
          emitEvent: params.emitEvent,
          enqueueLedgerCommand: params.enqueueLedgerCommand,
        })
      return Result.ok({
        checkoutSession,
        purchase,
        invoice,
      })
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
    async (ctx) => {
      return processSetupIntentSucceeded(setupIntent, ctx)
    }
  )

  const { purchase, checkoutSession } = setupSuceededResult
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
     * Only run purchase-specific logic when a purchase exists.
     * Some setup intent flows (AddPaymentMethod, ActivateSubscription,
     * terminal checkout sessions) legitimately have null purchases.
     */
    if (purchase) {
      const priceId = purchase.priceId
      const { product } = await adminTransaction(
        async ({ transaction }) => {
          // Usage prices have null productId, causing innerJoin to return empty array
          const results =
            await selectPriceProductAndOrganizationByPriceWhere(
              {
                id: priceId,
              },
              transaction
            )
          return {
            product: results.length > 0 ? results[0].product : null,
          }
        }
      )

      /**
       * As the purchase session cookie is no longer needed, delete it.
       * For usage prices, product is null so only purchase cookie gets deleted.
       * The deleteCheckoutSessionCookie helper handles undefined productId.
       */
      await deleteCheckoutSessionCookie({
        purchaseId: purchase.id,
        productId: product?.id,
      })
    }

    return Response.redirect(url, 303)
  } catch (error) {
    console.error('Error in post-payment route:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
