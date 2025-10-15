import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingRun } from '@/db/schema/billingRuns'
import { Customer } from '@/db/schema/customers'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { Invoice } from '@/db/schema/invoices'
import { Organization } from '@/db/schema/organizations'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Payment } from '@/db/schema/payments'
import { selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId } from '@/db/tableMethods/billingPeriodItemMethods'
import { updateBillingPeriod } from '@/db/tableMethods/billingPeriodMethods'
import {
  safelyInsertBillingRun,
  selectBillingRunById,
  selectBillingRuns,
  updateBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import { selectCountryById } from '@/db/tableMethods/countryMethods'
import {
  deleteInvoiceLineItemsByinvoiceId,
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
  updatePayment,
} from '@/db/tableMethods/paymentMethods'
import { sumNetTotalSettledPaymentsForBillingPeriod } from '@/utils/paymentHelpers'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  CountryCode,
  CurrencyCode,
  InvoiceStatus,
  InvoiceType,
  LedgerTransactionType,
  PaymentStatus,
  FeatureType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { calculateTotalDueAmount } from '@/utils/bookkeeping/fees/common'
import { createAndFinalizeSubscriptionFeeCalculation } from '@/utils/bookkeeping/fees/subscription'
import core from '@/utils/core'
import {
  createAndConfirmPaymentIntentForBillingRun,
  createPaymentIntentForBillingRun,
  confirmPaymentIntentForBillingRun,
  stripeIdFromObjectOrId,
} from '@/utils/stripe'
import { generateInvoicePdfTask } from '@/trigger/generate-invoice-pdf'
import { Subscription } from '@/db/schema/subscriptions'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import {
  aggregateOutstandingBalanceForUsageCosts,
  claimLedgerEntriesWithOutstandingBalances,
} from '@/db/tableMethods/ledgerEntryMethods'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'

interface CreateBillingRunInsertParams {
  billingPeriod: BillingPeriod.Record
  paymentMethod: PaymentMethod.Record
  scheduledFor: Date | number
}

export const createBillingRunInsert = (
  params: CreateBillingRunInsertParams
): BillingRun.Insert => {
  const { billingPeriod, scheduledFor } = params
  return {
    billingPeriodId: billingPeriod.id,
    scheduledFor: new Date(scheduledFor).getTime(),
    status: BillingRunStatus.Scheduled,
    subscriptionId: billingPeriod.subscriptionId,
    paymentMethodId: params.paymentMethod.id,
    livemode: billingPeriod.livemode,
  }
}

export const createBillingRun = async (
  params: CreateBillingRunInsertParams,
  transaction: DbTransaction
) => {
  const insert = createBillingRunInsert(params)
  return safelyInsertBillingRun(insert, transaction)
}

export const calculateFeeAndTotalAmountDueForBillingPeriod = async (
  {
    billingPeriod,
    billingPeriodItems,
    organization,
    paymentMethod,
    usageOverages,
    billingRun,
  }: {
    paymentMethod: PaymentMethod.Record
    billingPeriod: BillingPeriod.Record
    billingPeriodItems: BillingPeriodItem.Record[]
    organization: Organization.Record
    billingRun: BillingRun.Record
    usageOverages: {
      usageEventId: string
      usageMeterId: string
      balance: number
    }[]
  },
  transaction: DbTransaction
): Promise<{
  feeCalculation: FeeCalculation.Record
  totalDueAmount: number
}> => {
  const countryId = organization.countryId
  if (!countryId) {
    throw Error(
      `Cannot run billing for a billing period with an organization that does not have a country id.` +
        `Organization: ${organization.id}; Billing Period: ${billingPeriod.id}`
    )
  }
  const organizationCountry = await selectCountryById(
    countryId,
    transaction
  )
  await claimLedgerEntriesWithOutstandingBalances(
    usageOverages.map((usageOverage) => usageOverage.usageEventId),
    billingRun,
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
        usageOverages,
      },
      transaction
    )
  const totalDueAmount = calculateTotalDueAmount(feeCalculation)
  return { feeCalculation, totalDueAmount }
}

interface CreateInvoiceInsertForBillingRunParams {
  billingPeriod: BillingPeriod.Record
  organization: Organization.Record
  customer: Customer.Record
  currency: CurrencyCode
}

export const createInvoiceInsertForBillingRun = async (
  params: CreateInvoiceInsertForBillingRunParams,
  transaction: DbTransaction
): Promise<Invoice.Insert> => {
  const { billingPeriod, organization, customer } = params
  const invoicesForCustomer = await selectInvoices(
    {
      customerId: customer.id,
    },
    transaction
  )
  return {
    customerId: customer.id,
    organizationId: organization.id,
    invoiceNumber: core.createInvoiceNumber(
      customer.invoiceNumberBase!,
      invoicesForCustomer.length
    ),
    taxCountry: customer.billingAddress?.address
      .country as CountryCode,
    currency: params.currency,
    livemode: billingPeriod.livemode,
    invoiceDate: Date.now(),
    dueDate: Date.now(),
    status: InvoiceStatus.Draft,
    billingPeriodStartDate: billingPeriod.startDate,
    billingPeriodEndDate: billingPeriod.endDate,
    type: InvoiceType.Subscription,
    billingPeriodId: billingPeriod.id,
    purchaseId: null,
    subscriptionId: billingPeriod.subscriptionId,
  }
}

export type OutstandingUsageCostAggregation = {
  ledgerAccountId: string
  usageMeterId: string
  subscriptionId: string
  outstandingBalance: number
}

// Helper function to tabulate outstanding usage costs
export const tabulateOutstandingUsageCosts = async (
  subscriptionId: string,
  billingPeriodEndDate: Date | number,
  transaction: DbTransaction
): Promise<{
  outstandingUsageCostsByLedgerAccountId: Map<
    string,
    OutstandingUsageCostAggregation
  >
  rawOutstandingUsageCosts: Awaited<
    ReturnType<typeof aggregateOutstandingBalanceForUsageCosts>
  >
}> => {
  const ledgerAccountsForSubscription = await selectLedgerAccounts(
    {
      subscriptionId,
    },
    transaction
  )
  const rawOutstandingUsageCosts =
    await aggregateOutstandingBalanceForUsageCosts(
      {
        ledgerAccountId: ledgerAccountsForSubscription.map(
          (ledgerAccount) => ledgerAccount.id
        ),
      },
      billingPeriodEndDate,
      transaction
    )

  const outstandingUsageCostsByLedgerAccountId = new Map()
  rawOutstandingUsageCosts.forEach((usageCost) => {
    if (
      !outstandingUsageCostsByLedgerAccountId.has(
        usageCost.ledgerAccountId
      )
    ) {
      outstandingUsageCostsByLedgerAccountId.set(
        usageCost.ledgerAccountId,
        {
          ledgerAccountId: usageCost.ledgerAccountId,
          usageMeterId: usageCost.usageMeterId,
          subscriptionId: subscriptionId,
          outstandingBalance: usageCost.balance,
        }
      )
    } else {
      outstandingUsageCostsByLedgerAccountId.get(
        usageCost.ledgerAccountId
      )!.outstandingBalance += usageCost.balance
    }
  })

  return {
    outstandingUsageCostsByLedgerAccountId,
    rawOutstandingUsageCosts,
  }
}

export const billingPeriodItemsToInvoiceLineItemInserts = ({
  invoiceId,
  billingPeriodItems,
  usageOverages,
  billingRunId,
}: {
  billingRunId: string
  invoiceId: string
  billingPeriodItems: BillingPeriodItem.Record[]
  usageOverages: {
    ledgerAccountId: string
    usageMeterId: string
    balance: number
  }[]
}): InvoiceLineItem.Insert[] => {
  const usageOverageByUsageMeterId = new Map<
    string,
    {
      usageMeterId: string
      balance: number
      ledgerAccountId: string
    }
  >(
    usageOverages.map((usageOverage) => [
      usageOverage.usageMeterId,
      usageOverage,
    ])
  )
  const invoiceLineItemInserts: (
    | InvoiceLineItem.Insert
    | undefined
  )[] = billingPeriodItems.map((billingPeriodItem) => {
    if (billingPeriodItem.type === SubscriptionItemType.Usage) {
      const usageOverage = usageOverageByUsageMeterId.get(
        billingPeriodItem.usageMeterId
      )
      /**
       * If there is no usage overage for the usage meter, we skip the line item.
       */
      if (!usageOverage) {
        return undefined
      }
      const insert: InvoiceLineItem.UsageInsert = {
        priceId: null,
        billingRunId,
        invoiceId,
        ledgerAccountCredit: usageOverage.balance,
        quantity:
          usageOverage.balance && billingPeriodItem.usageEventsPerUnit
            ? usageOverage.balance /
              billingPeriodItem.usageEventsPerUnit
            : 0,
        type: SubscriptionItemType.Usage,
        ledgerAccountId: usageOverage!.ledgerAccountId,
        livemode: billingPeriodItem.livemode,
        price: billingPeriodItem.unitPrice,
        description: `${billingPeriodItem.name}${
          billingPeriodItem.description &&
          ` - ${billingPeriodItem.description}`
        }`,
      }
      return insert
    }

    const insert: InvoiceLineItem.StaticInsert = {
      invoiceId,
      billingRunId,
      quantity: billingPeriodItem.quantity,
      livemode: billingPeriodItem.livemode,
      price: billingPeriodItem.unitPrice,
      description: `${billingPeriodItem.name}${
        billingPeriodItem.description &&
        ` - ${billingPeriodItem.description}`
      }`,
      type: SubscriptionItemType.Static,
      ledgerAccountId: null,
      ledgerAccountCredit: null,
      priceId: null,
    }
    return insert
  })
  return invoiceLineItemInserts
    .filter((item) => item !== undefined)
    .filter((item) => item.quantity > 0)
}

export const processOutstandingBalanceForBillingPeriod = async (
  billingPeriod: BillingPeriod.Record,
  transaction: DbTransaction
): Promise<BillingPeriod.Record> => {
  if (
    Date.now() > billingPeriod.endDate &&
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
  const now = Date.now()
  const billingPeriodConcluded = now > billingPeriod.endDate
  const billingPeriodActive =
    now >= billingPeriod.startDate && now < billingPeriod.endDate
  const billingPeriodFuture = now < billingPeriod.startDate
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
): Promise<ExecuteBillingRunStepsResult> => {
  const {
    billingPeriodItems,
    organization,
    billingPeriod,
    subscription,
    customer,
  } =
    await selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId(
      billingRun.billingPeriodId,
      transaction
    )

  const paymentMethod = await selectPaymentMethodById(
    billingRun.paymentMethodId,
    transaction
  )
  const { rawOutstandingUsageCosts: usageOverages } =
    await tabulateOutstandingUsageCosts(
      billingPeriod.subscriptionId,
      new Date(billingPeriod.endDate),
      transaction
    )
  const { feeCalculation, totalDueAmount } =
    await calculateFeeAndTotalAmountDueForBillingPeriod(
      {
        billingPeriodItems,
        billingPeriod,
        organization,
        paymentMethod,
        usageOverages,
        billingRun,
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
      billingPeriodId: billingPeriod.id,
    },
    transaction
  )

  invoice = invoiceForBillingPeriod

  if (!invoice) {
    const invoiceInsert = await createInvoiceInsertForBillingRun(
      {
        billingPeriod,
        organization,
        customer,
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
      customer,
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
  await deleteInvoiceLineItemsByinvoiceId(invoice.id, transaction)

  const invoiceLineItemInserts =
    billingPeriodItemsToInvoiceLineItemInserts({
      invoiceId: invoice.id,
      billingPeriodItems,
      usageOverages,
      billingRunId: billingRun.id,
    })
  await insertInvoiceLineItems(invoiceLineItemInserts, transaction)

  // Update invoice with accurate subtotal and tax amounts from fee calculation
  // This ensures email templates display correct totals including discounts
  await updateInvoice(
    {
      id: invoice.id,
      type: invoice.type, // Required for discriminated union schema
      billingPeriodId: invoice.billingPeriodId, // Required for subscription invoices
      subscriptionId: invoice.subscriptionId, // Required for subscription invoices
      subtotal: feeCalculation.pretaxTotal,
      taxAmount: feeCalculation.taxAmountFixed,
    } as Invoice.Update,
    transaction
  )

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
      customer,
      organization,
      billingPeriod: processBillingPeriodResult.billingPeriod,
      subscription,
      paymentMethod,
      totalDueAmount,
      totalAmountPaid,
      payments,
    }
  }
  const stripeCustomerId = customer.stripeCustomerId
  const stripePaymentMethodId = paymentMethod.stripePaymentMethodId
  if (!stripeCustomerId) {
    throw new Error(
      `Cannot run billing for a billing period with a customer that does not have a stripe customer id.` +
        ` Customer: ${customer.id}; Billing Period: ${billingPeriod.id}`
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
    organizationId: organization.id,
    chargeDate: Date.now(),
    customerId: customer.id,
    invoiceId: invoice.id,
    paymentMethodId: paymentMethod.id,
    refunded: false,
    refundedAmount: 0,
    refundedAt: null,
    /**
     * Sometimes billing details address is nested.
     * othertimes it is not. Try nested first, then fallback to non-nested.
     */
    taxCountry:
      (paymentMethod.billingDetails.address.address
        ?.country as CountryCode) ??
      (paymentMethod.billingDetails.address.country as CountryCode),
    paymentMethod: paymentMethod.type,
    stripePaymentIntentId: `placeholder____${core.nanoid()}`,
    livemode: billingPeriod.livemode,
    subscriptionId: billingPeriod.subscriptionId,
    billingPeriodId: billingPeriod.id,
  }

  const payment = await insertPayment(paymentInsert, transaction)
  /**
   * Eagerly update the billing run status to AwaitingPaymentConfirmation
   * to ensure that the billing run is in the correct state.
   */
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
    customer,
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
  const { totalDueAmount, totalAmountPaid } = params
  return Math.max(0, totalDueAmount - totalAmountPaid)
}

// Define return type for executeBillingRunCalculationAndBookkeepingSteps
type ExecuteBillingRunStepsResult = {
  invoice: Invoice.Record
  payment?: Payment.Record
  feeCalculation: FeeCalculation.Record
  customer: Customer.Record
  organization: Organization.Record
  billingPeriod: BillingPeriod.Record
  subscription: Subscription.Record
  paymentMethod: PaymentMethod.Record
  totalDueAmount: number
  totalAmountPaid: number
  payments: Payment.Record[]
}

/**
 * FIXME : support discount redemptions
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
      // Adjusted destructuring
      invoice,
      payment,
      feeCalculation,
      customer,
      billingPeriod,
      paymentMethod,
      totalDueAmount,
      totalAmountPaid,
      organization,
      payments,
    } =
      await comprehensiveAdminTransaction<ExecuteBillingRunStepsResult>(
        async ({ transaction }) => {
          const resultFromSteps =
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          const subscriptionItems =
            await selectCurrentlyActiveSubscriptionItems(
              {
                subscriptionId: resultFromSteps.subscription.id,
              },
              new Date(),
              transaction
            )
          const subscriptionItemFeatures: SubscriptionItemFeature.Record[] =
            await selectSubscriptionItemFeatures(
              {
                subscriptionItemId: subscriptionItems.map(
                  (item) => item.id
                ),
                type: FeatureType.UsageCreditGrant,
              },
              transaction
            )
          /**
           * For typesafety
           */
          const usageCreditGrantFeatures =
            subscriptionItemFeatures.filter(
              (feature) =>
                feature.type === FeatureType.UsageCreditGrant
            )
          const currentBillingPeriodObject =
            resultFromSteps.billingPeriod

          return {
            result: resultFromSteps,
            eventsToInsert: [],
          }
        },
        {
          livemode: billingRun.livemode,
        }
      )
    if (!customer.stripeCustomerId) {
      throw new Error(
        `Cannot run billing for a billing period with a customer that does not have a stripe customer id.` +
          ` Customer: ${customer.id}; Billing Period: ${billingPeriod.id}`
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
    if (!core.IS_TEST) {
      /**
       * Deliberately NOT using the idempotency key here -
       * it's possible that the invoice will change before the billing run is processed.
       * It may actually be ok to execute idempotently, but this is safer for now.
       */
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
            ...invoice,
            status: InvoiceStatus.Paid,
          } as Invoice.Update,
          transaction
        )
        await updateBillingRun(
          {
            id: billingRun.id,
            status: BillingRunStatus.Succeeded,
          },
          transaction
        )
      })
      return
    }

    // Step 1: Create payment intent
    const paymentIntent = await createPaymentIntentForBillingRun({
      amount: totalAmountToCharge,
      currency: invoice.currency,
      stripeCustomerId: customer.stripeCustomerId,
      stripePaymentMethodId: paymentMethod.stripePaymentMethodId,
      billingPeriodId: billingRun.billingPeriodId,
      billingRunId: billingRun.id,
      feeCalculation,
      organization,
      livemode: billingRun.livemode,
    });

    // Step 2: Associate with payment record (close transaction)
    await adminTransaction(async ({ transaction }) => {
      await updatePayment(
        {
          id: payment.id,
          stripePaymentIntentId: paymentIntent.id,
        },
        transaction
      )
      await updateInvoice(
        {
          id: invoice.id,
          stripePaymentIntentId: paymentIntent.id,
          purchaseId: invoice.purchaseId,
          billingPeriodId: invoice.billingPeriodId,
          type: invoice.type,
          subscriptionId: invoice.subscriptionId,
          billingRunId: billingRun.id,
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
          stripePaymentIntentId: paymentIntent.id,
        },
        transaction
      )
    }, {
      livemode: billingRun.livemode,
    })

    // Step 3: Confirm payment intent (outside transaction)
    const confirmationResult = await confirmPaymentIntentForBillingRun(
      paymentIntent.id, 
      billingRun.livemode
    );

    // Step 4: Update payment record with charge ID
    await adminTransaction(async ({ transaction }) => {
      await updatePayment({
        id: payment.id,
        stripeChargeId: confirmationResult.latest_charge
          ? stripeIdFromObjectOrId(confirmationResult.latest_charge)
          : null,
      }, transaction);
    }, {
      livemode: billingRun.livemode,
    });

    return {
      invoice,
      payment,
      feeCalculation,
      customer,
      billingPeriod,
      paymentMethod,
      totalDueAmount,
      totalAmountPaid,
      organization,
      payments,
    }
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
   * FIXME: mark the subscription as canceled (?)
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
    billingPeriodId: billingRun.billingPeriodId,
    status: BillingRunStatus.Scheduled,
    scheduledFor: Date.now() + daysFromNowToRetry * dayInMilliseconds,
    subscriptionId: billingRun.subscriptionId,
    paymentMethodId: billingRun.paymentMethodId,
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
      billingPeriodId: billingRun.billingPeriodId,
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
  return safelyInsertBillingRun(retryBillingRun, transaction)
}
