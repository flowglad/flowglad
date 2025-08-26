import {
  PriceType,
  CheckoutSessionStatus,
  CheckoutSessionType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { calculateTotalDueAmount } from '@/utils/bookkeeping/fees/common'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { createInitialInvoiceForPurchase } from '@/utils/bookkeeping'
import { isNil } from '../core'
import { processPurchaseBookkeepingForCheckoutSession } from './checkoutSessions'

export const processNonPaymentCheckoutSession = async (
  checkoutSession: CheckoutSession.Record,
  transaction: DbTransaction
) => {
  checkoutSession = await updateCheckoutSession(
    {
      ...checkoutSession,
      status: CheckoutSessionStatus.Succeeded,
    },
    transaction
  )
  if (checkoutSession.type === CheckoutSessionType.Invoice) {
    throw new Error(
      `Invoice checkout flow does not support non-payment checkout sessions. If the invoice had 0 balance due, the invoice should have been paid automatically. ${checkoutSession.id}`
    )
  }

  if (checkoutSession.type === CheckoutSessionType.AddPaymentMethod) {
    throw new Error(
      `Add payment method checkout flow does not support non-payment checkout sessions, which are reserved for purchases rather than payment method additions. ${checkoutSession.id}`
    )
  }

  const price = await selectPriceById(
    checkoutSession.priceId!,
    transaction
  )

  let purchase = checkoutSession.purchaseId
    ? await selectPurchaseById(
        checkoutSession.purchaseId,
        transaction
      )
    : null
  const priceType = purchase?.priceType ?? price.type
  if (priceType === PriceType.Subscription) {
    throw new Error(
      `Attempted to process a non-payment purchase session ${checkoutSession.id} for a subscription, which is currently not supported`
    )
  }
  const feeCalculation = await selectLatestFeeCalculation(
    {
      checkoutSessionId: checkoutSession.id,
    },
    transaction
  )
  if (!feeCalculation) {
    throw new Error(
      `No fee calculation found for purchase session ${checkoutSession.id}`
    )
  }

  const totalDue = await calculateTotalDueAmount(feeCalculation)

  if (isNil(totalDue)) {
    throw new Error(
      `Total due for purchase session ${checkoutSession.id} was not calculated`
    )
  }

  if (totalDue !== 0) {
    throw new Error(
      `Total due for purchase session ${checkoutSession.id} is not 0, it's: ${totalDue}`
    )
  }

  const upsertPurchaseResult =
    await processPurchaseBookkeepingForCheckoutSession(
      { checkoutSession, stripeCustomerId: null },
      transaction
    )
  purchase = upsertPurchaseResult.purchase
  const invoiceForPurchase = await createInitialInvoiceForPurchase(
    {
      purchase,
    },
    transaction
  )
  return { purchase, invoice: invoiceForPurchase.invoice }
}
