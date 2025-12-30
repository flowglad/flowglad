import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { Payment } from '@/db/schema/payments'
import {
  selectLatestFeeCalculation,
  updateFeeCalculation,
} from '@/db/tableMethods/feeCalculationMethods'
import { updatePayment } from '@/db/tableMethods/paymentMethods'
import type { DbTransaction } from '@/db/types'
import { StripeConnectContractType } from '@/types'
import { logger } from '@/utils/logger'
import { createStripeTaxTransactionFromCalculation } from '@/utils/stripe'

const selectFeeCalculationForPayment = async (
  {
    payment,
    invoice,
  }: { payment: Payment.Record; invoice: Invoice.Record },
  transaction: DbTransaction
): Promise<FeeCalculation.Record | null> => {
  if (payment.purchaseId) {
    return selectLatestFeeCalculation(
      { purchaseId: payment.purchaseId },
      transaction
    )
  }
  if (invoice.billingPeriodId) {
    return selectLatestFeeCalculation(
      { billingPeriodId: invoice.billingPeriodId },
      transaction
    )
  }
  if (invoice.purchaseId) {
    return selectLatestFeeCalculation(
      { purchaseId: invoice.purchaseId },
      transaction
    )
  }
  return null
}

/**
 * Creates a Stripe Tax Transaction (step 2 of the Stripe Tax flow) for MoR
 * payments, using the Stripe Tax Calculation (step 1) stored on the related
 * fee calculation.
 *
 * This is best-effort: failures are logged and do not throw, so payment success
 * processing is not blocked.
 */
export const createStripeTaxTransactionIfNeededForPayment = async (
  {
    organization,
    payment,
    invoice,
  }: {
    organization: Organization.Record
    payment: Payment.Record
    invoice: Invoice.Record
  },
  transaction: DbTransaction
): Promise<string | null> => {
  if (
    organization.stripeConnectContractType !==
    StripeConnectContractType.MerchantOfRecord
  ) {
    return null
  }
  
  if (payment.stripeTaxTransactionId) {
    return payment.stripeTaxTransactionId
  }

  try {

    const feeCalculation = await selectFeeCalculationForPayment(
      { payment, invoice },
      transaction
    )

    if (feeCalculation?.stripeTaxTransactionId) {
      await updatePayment(
        {
          id: payment.id,
          stripeTaxTransactionId:
            feeCalculation.stripeTaxTransactionId,
        },
        transaction
      )
      return feeCalculation.stripeTaxTransactionId
    }

    const stripeTaxCalculationId =
      feeCalculation?.stripeTaxCalculationId ?? null

    const stripeTaxTransaction =
      await createStripeTaxTransactionFromCalculation({
        stripeTaxCalculationId,
        reference: payment.id,
        livemode: payment.livemode,
      })

    if (!stripeTaxTransaction) {
      return null
    }

    await updatePayment(
      {
        id: payment.id,
        stripeTaxTransactionId: stripeTaxTransaction.id,
      },
      transaction
    )

    if (feeCalculation) {
      await updateFeeCalculation(
        {
          id: feeCalculation.id,
          type: feeCalculation.type,
          stripeTaxTransactionId: stripeTaxTransaction.id,
        },
        transaction
      )
    }

    return stripeTaxTransaction.id
  } catch (error) {
    const errorToLog =
      error instanceof Error ? error : new Error(String(error))
    logger.error(errorToLog, {
      paymentId: payment.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
    })
    return null
  }
}
