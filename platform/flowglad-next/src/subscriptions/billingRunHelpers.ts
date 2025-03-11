import { adminTransaction } from '@/db/databaseMethods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingRun } from '@/db/schema/billingRuns'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { Invoice } from '@/db/schema/invoices'
import { Organization } from '@/db/schema/organizations'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Payment } from '@/db/schema/payments'
import { selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId } from '@/db/tableMethods/billingPeriodItemMethods'
import { updateBillingPeriod } from '@/db/tableMethods/billingPeriodMethods'
import {
  insertBillingRun,
  selectBillingRunById,
  selectBillingRuns,
  updateBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import { selectCountryById } from '@/db/tableMethods/countryMethods'
import {
  deleteInvoiceLineItemsByInvoiceId,
  insertInvoiceLineItems,
} from '@/db/tableMethods/invoiceLineItemMethods'
import {
  invoiceIsInTerminalState,
  insertInvoice,
  selectInvoices,
  updateInvoice,
  safelyUpdateInvoiceStatus,
} from '@/db/tableMethods/invoiceMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import {
  insertPayment,
  sumNetTotalSettledPaymentsForBillingPeriod,
  updatePayment,
} from '@/db/tableMethods/paymentMethods'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  CountryCode,
  CurrencyCode,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
} from '@/types'
import { DbTransaction } from '@/db/types'
import {
  calculateTotalDueAmount,
  createAndFinalizeSubscriptionFeeCalculation,
} from '@/utils/bookkeeping/fees'
import core from '@/utils/core'
import {
  createAndConfirmPaymentIntent,
  stripeIdFromObjectOrId,
} from '@/utils/stripe'
import { generateInvoicePdfTask } from '@/trigger/generate-invoice-pdf'
import { generatePaymentReceiptPdfTask } from '@/trigger/generate-receipt-pdf'

interface CreateBillingRunInsertParams {
  billingPeriod: BillingPeriod.Record
  PaymentMethodId: string
  scheduledFor: Date
}

export const createBillingRunInsert = (
  params: CreateBillingRunInsertParams
): BillingRun.Insert => {
  const { billingPeriod, scheduledFor } = params
  return {
    BillingPeriodId: billingPeriod.id,
    scheduledFor,
    status: BillingRunStatus.Scheduled,
    SubscriptionId: billingPeriod.SubscriptionId,
    PaymentMethodId: params.PaymentMethodId,
    livemode: billingPeriod.livemode,
  }
}

export const createBillingRun = async (
  params: CreateBillingRunInsertParams,
  transaction: DbTransaction
) => {
  const insert = createBillingRunInsert(params)
  return insertBillingRun(insert, transaction)
}

export const calculateFeeAndTotalAmountDueForBillingPeriod = async (
  {
    billingPeriod,
    billingPeriodItems,
    organization,
    paymentMethod,
  }: {
    paymentMethod: PaymentMethod.Record
    billingPeriod: BillingPeriod.Record
    billingPeriodItems: BillingPeriodItem.Record[]
    organization: Organization.Record
  },
  transaction: DbTransaction
): Promise<{
  feeCalculation: FeeCalculation.Record
  totalDueAmount: number
}> => {
  const CountryId = organization.CountryId
  if (!CountryId) {
    throw Error(
      `Cannot run billing for a billing period with an organization that does not have a country id.` +
        `Organization: ${organization.id}; Billing Period: ${billingPeriod.id}`
    )
  }
  const organizationCountry = await selectCountryById(
    CountryId,
    transaction
  )

  const feeCalculation =
    await createAndFinalizeSubscriptionFeeCalculation(
      {
        billingPeriodItems,
        billingPeriod,
        paymentMethod: paymentMethod,
        organization,
        organizationCountry,
        livemode: billingPeriod.livemode,
        currency: organization.defaultCurrency,
      },
      transaction
    )
  const totalDueAmount = calculateTotalDueAmount(feeCalculation)
  return { feeCalculation, totalDueAmount }
}

interface CreateInvoiceInsertForBillingRunParams {
  billingPeriod: BillingPeriod.Record
  organization: Organization.Record
  customerProfile: CustomerProfile.Record
  currency: CurrencyCode
}

export const createInvoiceInsertForBillingRun = async (
  params: CreateInvoiceInsertForBillingRunParams,
  transaction: DbTransaction
): Promise<Invoice.Insert> => {
  const { billingPeriod, organization, customerProfile } = params
  const invoicesForCustomerProfile = await selectInvoices(
    {
      CustomerProfileId: customerProfile.id,
    },
    transaction
  )
  return {
    CustomerProfileId: customerProfile.id,
    OrganizationId: organization.id,
    invoiceNumber: core.createInvoiceNumber(
      customerProfile.invoiceNumberBase!,
      invoicesForCustomerProfile.length
    ),
    currency: params.currency,
    livemode: billingPeriod.livemode,
    invoiceDate: new Date(),
    dueDate: new Date(),
    status: InvoiceStatus.Draft,
    billingPeriodStartDate: billingPeriod.startDate,
    billingPeriodEndDate: billingPeriod.endDate,
    type: InvoiceType.Subscription,
    BillingPeriodId: billingPeriod.id,
    PurchaseId: null,
  }
}

export const billingPeriodItemsToInvoiceLineItemInserts = ({
  InvoiceId,
  billingPeriodItems,
}: {
  InvoiceId: string
  billingPeriodItems: BillingPeriodItem.Record[]
}): InvoiceLineItem.Insert[] => {
  return billingPeriodItems.map((billingPeriodItem) => {
    return {
      BillingPeriodItemId: billingPeriodItem.id,
      InvoiceId,
      quantity: billingPeriodItem.quantity,
      livemode: billingPeriodItem.livemode,
      price: billingPeriodItem.unitPrice,
      description: `${billingPeriodItem.name}${
        billingPeriodItem.description &&
        `- ${billingPeriodItem.description}`
      }`,
    }
  })
}

export const processOutstandingBalanceForBillingPeriod = async (
  billingPeriod: BillingPeriod.Record,
  transaction: DbTransaction
): Promise<BillingPeriod.Record> => {
  if (
    new Date() > billingPeriod.endDate &&
    billingPeriod.status !== BillingPeriodStatus.PastDue
  ) {
    return updateBillingPeriod(
      {
        id: billingPeriod.id,
        status: BillingPeriodStatus.PastDue,
      },
      transaction
    )
  }
  return billingPeriod
}

export const processNoMoreDueForBillingPeriod = async (
  {
    billingRun: initialBillingRun,
    billingPeriod: initialBillingPeriod,
    invoice: initialInvoice,
  }: {
    billingRun: BillingRun.Record
    billingPeriod: BillingPeriod.Record
    invoice: Invoice.Record
  },
  transaction: DbTransaction
) => {
  let billingRun = initialBillingRun
  let billingPeriod = initialBillingPeriod
  let invoice = initialInvoice
  billingRun = await updateBillingRun(
    {
      id: billingRun.id,
      status: BillingRunStatus.Succeeded,
    },
    transaction
  )
  const billingPeriodConcluded = new Date() > billingPeriod.endDate
  const billingPeriodActive =
    new Date() >= billingPeriod.startDate &&
    new Date() <= billingPeriod.endDate
  const billingPeriodFuture = new Date() < billingPeriod.startDate
  let billingPeriodStatus: BillingPeriodStatus
  if (billingPeriodFuture) {
    billingPeriodStatus = BillingPeriodStatus.Upcoming
  } else if (billingPeriodActive) {
    billingPeriodStatus = BillingPeriodStatus.Active
  } else if (billingPeriodConcluded) {
    billingPeriodStatus = BillingPeriodStatus.Completed
  } else {
    billingPeriodStatus = BillingPeriodStatus.Active
  }
  billingPeriod = await updateBillingPeriod(
    {
      id: billingPeriod.id,
      status: billingPeriodStatus,
    },
    transaction
  )
  invoice = await safelyUpdateInvoiceStatus(
    invoice,
    InvoiceStatus.Paid,
    transaction
  )
  return { billingRun, billingPeriod, invoice }
}

export const executeBillingRunCalculationAndBookkeepingSteps = async (
  billingRun: BillingRun.Record,
  transaction: DbTransaction
) => {
  const {
    billingPeriodItems,
    organization,
    billingPeriod,
    subscription,
    customerProfile,
  } =
    await selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId(
      billingRun.BillingPeriodId,
      transaction
    )

  const paymentMethod = await selectPaymentMethodById(
    billingRun.PaymentMethodId,
    transaction
  )

  const { feeCalculation, totalDueAmount } =
    await calculateFeeAndTotalAmountDueForBillingPeriod(
      {
        billingPeriodItems,
        billingPeriod,
        organization,
        paymentMethod,
      },
      transaction
    )
  const { total: totalAmountPaid, payments } =
    await sumNetTotalSettledPaymentsForBillingPeriod(
      billingPeriod.id,
      transaction
    )

  let invoice: Invoice.Record | undefined
  const [invoiceForBillingPeriod] = await selectInvoices(
    {
      BillingPeriodId: billingPeriod.id,
    },
    transaction
  )

  invoice = invoiceForBillingPeriod

  if (!invoice) {
    const invoiceInsert = await createInvoiceInsertForBillingRun(
      {
        billingPeriod,
        organization,
        customerProfile,
        currency: feeCalculation.currency,
      },
      transaction
    )
    invoice = await insertInvoice(invoiceInsert, transaction)
  }
  /**
   * If the invoice is in a terminal state, we can skip the rest of the steps
   */
  if (invoiceIsInTerminalState(invoice)) {
    await updateBillingRun(
      {
        id: billingRun.id,
        status: BillingRunStatus.Succeeded,
      },
      transaction
    )
    /**
     * Infer the billing period status from the billing period
     */
    let billingPeriodStatus: BillingPeriodStatus
    if (invoice.status === InvoiceStatus.Uncollectible) {
      billingPeriodStatus = BillingPeriodStatus.Canceled
    } else if (invoice.status === InvoiceStatus.Void) {
      billingPeriodStatus = BillingPeriodStatus.Canceled
    } else {
      billingPeriodStatus = billingPeriod.status
    }
    /**
     * If the billing period status has changed, update it in the DB.
     */
    let updatedBillingPeriod = billingPeriod
    if (billingPeriodStatus !== billingPeriod.status) {
      updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          status: billingPeriodStatus,
        },
        transaction
      )
    }
    return {
      invoice,
      feeCalculation,
      customerProfile,
      organization,
      billingPeriod: updatedBillingPeriod,
      subscription,
      paymentMethod,
      totalDueAmount,
      totalAmountPaid,
      payments,
    }
  }

  /**
   * "Evict" the invoice line items for the invoice
   * That way we can ensure the line items inserted are "fresh".
   */
  await deleteInvoiceLineItemsByInvoiceId(invoice.id, transaction)

  const invoiceLineItemInserts =
    billingPeriodItemsToInvoiceLineItemInserts({
      InvoiceId: invoice.id,
      billingPeriodItems,
    })

  await insertInvoiceLineItems(invoiceLineItemInserts, transaction)
  if (totalDueAmount <= 0) {
    const processBillingPeriodResult =
      await processNoMoreDueForBillingPeriod(
        {
          billingRun,
          billingPeriod,
          invoice,
        },
        transaction
      )
    return {
      invoice: processBillingPeriodResult.invoice,
      feeCalculation,
      customerProfile,
      organization,
      billingPeriod: processBillingPeriodResult.billingPeriod,
      subscription,
      paymentMethod,
      totalDueAmount,
      totalAmountPaid,
      payments,
    }
  }
  const stripeCustomerId = customerProfile.stripeCustomerId
  const stripePaymentMethodId = paymentMethod.stripePaymentMethodId
  if (!stripeCustomerId) {
    throw new Error(
      `Cannot run billing for a billing period with a customer profile that does not have a stripe customer id.` +
        ` Customer Profile: ${customerProfile.id}; Billing Period: ${billingPeriod.id}`
    )
  }
  if (!stripePaymentMethodId) {
    throw new Error(
      `Cannot run billing for a billing period with a payment method that does not have a stripe payment method id.` +
        `Payment Method: ${paymentMethod.id}; Billing Period: ${billingPeriod.id}`
    )
  }

  const paymentInsert: Payment.Insert = {
    amount: totalDueAmount,
    currency: invoice.currency,
    status: PaymentStatus.Processing,
    OrganizationId: organization.id,
    chargeDate: new Date(),
    CustomerProfileId: customerProfile.id,
    InvoiceId: invoice.id,
    PaymentMethodId: paymentMethod.id,
    refunded: false,
    refundedAmount: 0,
    refundedAt: null,
    taxCountry: paymentMethod.billingDetails.address.address
      ?.country as CountryCode,
    paymentMethod: paymentMethod.type,
    stripePaymentIntentId: `placeholder____${core.nanoid()}`,
    livemode: billingPeriod.livemode,
  }

  const payment = await insertPayment(paymentInsert, transaction)
  /**
   * Eagerly update the billing run status to AwaitingPaymentConfirmation
   * to ensure that the billing run is in the correct state.
   */
  await updateBillingRun(
    {
      id: billingRun.id,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      status: BillingRunStatus.AwaitingPaymentConfirmation,
    },
    transaction
  )

  return {
    invoice,
    payment,
    feeCalculation,
    customerProfile,
    organization,
    billingPeriod,
    subscription,
    paymentMethod,
    totalDueAmount,
    totalAmountPaid,
    payments,
  }
}

export const calculateTotalAmountToCharge = (params: {
  totalDueAmount: number
  totalAmountPaid: number
  payments: Payment.Record[]
}) => {
  const { totalDueAmount, totalAmountPaid, payments } = params
  return Math.max(0, totalDueAmount - totalAmountPaid)
}
/**
 * TODO : support discount redemptions
 * @param billingRun
 * @param livemode
 */
export const executeBillingRun = async (billingRunId: string) => {
  const billingRun = await adminTransaction(({ transaction }) => {
    return selectBillingRunById(billingRunId, transaction)
  })
  if (billingRun.status !== BillingRunStatus.Scheduled) {
    return
  }
  try {
    const {
      invoice,
      payment,
      feeCalculation,
      customerProfile,
      billingPeriod,
      paymentMethod,
      totalDueAmount,
      totalAmountPaid,
      organization,
      payments,
    } = await adminTransaction(
      ({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        ),
      {
        livemode: billingRun.livemode,
      }
    )
    if (!customerProfile.stripeCustomerId) {
      throw new Error(
        `Cannot run billing for a billing period with a customer profile that does not have a stripe customer id.` +
          ` Customer Profile: ${customerProfile.id}; Billing Period: ${billingPeriod.id}`
      )
    }
    if (!paymentMethod.stripePaymentMethodId) {
      throw new Error(
        `Cannot run billing for a billing period with a payment method that does not have a stripe payment method id.` +
          `Payment Method: ${paymentMethod.id}; Billing Period: ${billingPeriod.id}`
      )
    }
    /**
     * Only proceed with a charge attempt if there is a payment
     */
    if (!payment) {
      return
    }

    const totalAmountToCharge = calculateTotalAmountToCharge({
      totalDueAmount,
      totalAmountPaid,
      payments,
    })
    /**
     * Skip PDF generation in test mode
     */
    if (!core.IS_TEST) {
      await generateInvoicePdfTask.trigger({
        invoiceId: invoice.id,
      })
    }
    /**
     * If the total amount to charge is less than or equal to 0,
     * we can skip the charge attempt.
     */
    if (totalAmountToCharge <= 0) {
      await adminTransaction(async ({ transaction }) => {
        await updateInvoice(
          {
            id: invoice.id,
            status: InvoiceStatus.Paid,
          } as Invoice.Update,
          transaction
        )
      })
      return
    }

    const paymentIntent = await createAndConfirmPaymentIntent({
      amount: totalAmountToCharge,
      currency: invoice.currency,
      stripeCustomerId: customerProfile.stripeCustomerId,
      stripePaymentMethodId: paymentMethod.stripePaymentMethodId,
      billingPeriodId: billingRun.BillingPeriodId,
      billingRunId: billingRun.id,
      feeCalculation,
      organization,
      livemode: billingRun.livemode,
    })

    return adminTransaction(
      async ({ transaction }) => {
        await updatePayment(
          {
            id: payment.id,
            stripePaymentIntentId: paymentIntent.id,
            stripeChargeId: paymentIntent.latest_charge
              ? stripeIdFromObjectOrId(paymentIntent.latest_charge)
              : null,
          },
          transaction
        )
        await updateInvoice(
          {
            id: invoice.id,
            stripePaymentIntentId: paymentIntent.id,
            PurchaseId: invoice.PurchaseId,
            BillingPeriodId: invoice.BillingPeriodId,
            type: invoice.type,
          } as Invoice.Update,
          transaction
        )
        await safelyUpdateInvoiceStatus(
          invoice,
          InvoiceStatus.AwaitingPaymentConfirmation,
          transaction
        )
        await updateBillingRun(
          {
            id: billingRun.id,
            status: BillingRunStatus.AwaitingPaymentConfirmation,
          },
          transaction
        )
        return {
          invoice,
          payment,
          feeCalculation,
          customerProfile,
          billingPeriod,
          paymentMethod,
          totalDueAmount,
          totalAmountPaid,
          organization,
          payments,
        }
      },
      {
        livemode: billingRun.livemode,
      }
    )
  } catch (error) {
    console.error('Error executing billing run', {
      billingRunId,
      error,
    })
    return adminTransaction(async ({ transaction }) => {
      return updateBillingRun(
        {
          id: billingRun.id,
          status: BillingRunStatus.Failed,
          errorDetails: JSON.parse(JSON.stringify(error)),
        },
        transaction
      )
    })
  }
}

const retryTimesInDays = [3, 5, 5]
/**
 * Retry according to the default logic Stripe uses:
 * The default retry schedule often follows this pattern:
 * Initial attempt
 * Retry after 3 days
 * Retry after 5 days
 * Final retry after 5 days
 * @param billingRun
 * @param transaction
 * @returns
 */

const dayInMilliseconds = 1000 * 60 * 60 * 24

export const constructBillingRunRetryInsert = (
  billingRun: BillingRun.Record,
  allBillingRunsForBillingPeriod: BillingRun.Record[]
): BillingRun.Insert | undefined => {
  /**
   * TODO: mark the subscription as canceled (?)
   */
  if (
    allBillingRunsForBillingPeriod.length >=
    retryTimesInDays.length + 1
  ) {
    return undefined
  }
  const daysFromNowToRetry =
    retryTimesInDays[allBillingRunsForBillingPeriod.length - 1]

  return {
    BillingPeriodId: billingRun.BillingPeriodId,
    status: BillingRunStatus.Scheduled,
    scheduledFor: new Date(
      Date.now() + daysFromNowToRetry * dayInMilliseconds
    ),
    SubscriptionId: billingRun.SubscriptionId,
    PaymentMethodId: billingRun.PaymentMethodId,
    livemode: billingRun.livemode,
    /**
     * Use the same payment intent as the previous billing run.
     * That way we can statefully ensure the payment intent is the same.
     */
    stripePaymentIntentId: billingRun.stripePaymentIntentId,
    lastPaymentIntentEventTimestamp:
      billingRun.lastPaymentIntentEventTimestamp,
  }
}

export const scheduleBillingRunRetry = async (
  billingRun: BillingRun.Record,
  transaction: DbTransaction
) => {
  const allBillingRunsForBillingPeriod = await selectBillingRuns(
    {
      BillingPeriodId: billingRun.BillingPeriodId,
    },
    transaction
  )
  const retryBillingRun = constructBillingRunRetryInsert(
    billingRun,
    allBillingRunsForBillingPeriod
  )
  if (!retryBillingRun) {
    return
  }
  return insertBillingRun(retryBillingRun, transaction)
}
