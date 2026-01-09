import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Invoice } from '@/db/schema/invoices'
import type { Purchase } from '@/db/schema/purchases'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import type { TransactionOutput } from '@/db/transactionEnhacementTypes'
import type { DbTransaction } from '@/db/types'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PriceType,
} from '@/types'
import { createInitialInvoiceForPurchase } from '@/utils/bookkeeping'
import { calculateTotalDueAmount } from '@/utils/bookkeeping/fees/common'
import { isNil } from '../core'
import { processPurchaseBookkeepingForCheckoutSession } from './checkoutSessions'

export const processNonPaymentCheckoutSession = async (
  checkoutSession: CheckoutSession.Record,
  transaction: DbTransaction
): Promise<
  TransactionOutput<{
    purchase: Purchase.Record
    invoice: Invoice.Record
  }>
> => {
  checkoutSession = await updateCheckoutSession(
    {
      ...checkoutSession,
      status: CheckoutSessionStatus.Succeeded,
    },
    transaction
  )

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
  purchase = upsertPurchaseResult.result.purchase
  const invoiceForPurchase = await createInitialInvoiceForPurchase(
    {
      purchase,
    },
    transaction
  )
  return {
    result: { purchase, invoice: invoiceForPurchase.invoice },
    eventsToInsert: upsertPurchaseResult.eventsToInsert || [],
    ledgerCommand: upsertPurchaseResult.ledgerCommand,
  }
}
