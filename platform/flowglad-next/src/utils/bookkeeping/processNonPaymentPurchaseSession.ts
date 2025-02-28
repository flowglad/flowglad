import { Organization } from '@/db/schema/organizations'
import { updateCustomerProfile } from '@/db/tableMethods/customerProfileMethods'
import {
  DbTransaction,
  PriceType,
  PurchaseSessionStatus,
} from '@/types'

import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { PurchaseSession } from '@/db/schema/purchaseSessions'
import { updatePurchaseSession } from '@/db/tableMethods/purchaseSessionMethods'
import { selectVariantById } from '@/db/tableMethods/variantMethods'
import { calculateTotalDueAmount } from '@/utils/bookkeeping/fees'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { createInitialInvoiceForPurchase } from '@/utils/bookkeeping'
import { isNil } from '../core'
import { processPurchaseBookkeepingForPurchaseSession } from './purchaseSessions'

export const processNonPaymentPurchaseSession = async (
  purchaseSession: PurchaseSession.Record,
  transaction: DbTransaction
) => {
  purchaseSession = await updatePurchaseSession(
    {
      id: purchaseSession.id,
      status: PurchaseSessionStatus.Succeeded,
    },
    transaction
  )
  const variant = await selectVariantById(
    purchaseSession.VariantId,
    transaction
  )

  let purchase = purchaseSession.PurchaseId
    ? await selectPurchaseById(
        purchaseSession.PurchaseId,
        transaction
      )
    : null
  const priceType = purchase?.priceType ?? variant.priceType
  if (priceType === PriceType.Subscription) {
    throw new Error(
      `Attempted to process a non-payment purchase session ${purchaseSession.id} for a subscription, which is currently not supported`
    )
  }
  const feeCalculation = await selectLatestFeeCalculation(
    {
      PurchaseSessionId: purchaseSession.id,
    },
    transaction
  )
  if (!feeCalculation) {
    throw new Error(
      `No fee calculation found for purchase session ${purchaseSession.id}`
    )
  }

  const totalDue = await calculateTotalDueAmount(feeCalculation)

  if (isNil(totalDue)) {
    throw new Error(
      `Total due for purchase session ${purchaseSession.id} was not calculated`
    )
  }

  if (totalDue !== 0) {
    throw new Error(
      `Total due for purchase session ${purchaseSession.id} is not 0, it's: ${totalDue}`
    )
  }

  const upsertPurchaseResult =
    await processPurchaseBookkeepingForPurchaseSession(
      { purchaseSession, stripeCustomerId: null },
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
