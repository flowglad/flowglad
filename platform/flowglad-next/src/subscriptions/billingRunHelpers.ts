import { Result } from 'better-result'
import type Stripe from 'stripe'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { OutstandingUsageCostAggregation } from '@/db/ledgerManager/ledgerManagerTypes'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Payment } from '@/db/schema/payments'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId } from '@/db/tableMethods/billingPeriodItemMethods'
import { updateBillingPeriod } from '@/db/tableMethods/billingPeriodMethods'
import {
  safelyInsertBillingRun,
  selectBillingRunById,
  updateBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import { selectCountryById } from '@/db/tableMethods/countryMethods'
import {
  deleteInvoiceLineItemsByinvoiceId,
  insertInvoiceLineItems,
} from '@/db/tableMethods/invoiceLineItemMethods'
import {
  insertInvoice,
  invoiceIsInTerminalState,
  safelyUpdateInvoiceStatus,
  selectInvoices,
  updateInvoice,
} from '@/db/tableMethods/invoiceMethods'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'
import {
  aggregateOutstandingBalanceForUsageCosts,
  claimLedgerEntriesWithOutstandingBalances,
} from '@/db/tableMethods/ledgerEntryMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import {
  insertPayment,
  selectPayments,
  updatePayment,
} from '@/db/tableMethods/paymentMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { processOutcomeForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { generateInvoicePdfTask } from '@/trigger/generate-invoice-pdf'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  type CountryCode,
  type CurrencyCode,
  FeatureType,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  SubscriptionItemType,
  type UsageBillingInfo,
} from '@/types'
import { calculateTotalDueAmount } from '@/utils/bookkeeping/fees/common'
import { createAndFinalizeSubscriptionFeeCalculation } from '@/utils/bookkeeping/fees/subscription'
import core from '@/utils/core'
import { sumNetTotalSettledPaymentsForBillingPeriod } from '@/utils/paymentHelpers'
import {
  confirmPaymentIntentForBillingRun,
  createPaymentIntentForBillingRun,
  stripeIdFromObjectOrId,
} from '@/utils/stripe'
import { tracedTrigger } from '@/utils/triggerTracing'

interface CreateBillingRunInsertParams {
  billingPeriod: BillingPeriod.Record
  paymentMethod: PaymentMethod.Record
  scheduledFor: Date | number
  isAdjustment?: boolean
}

export const createBillingRunInsert = (
  params: CreateBillingRunInsertParams
): BillingRun.Insert => {
  const { billingPeriod, scheduledFor, isAdjustment = false } = params
  return {
    billingPeriodId: billingPeriod.id,
    scheduledFor: new Date(scheduledFor).getTime(),
    status: BillingRunStatus.Scheduled,
    subscriptionId: billingPeriod.subscriptionId,
    paymentMethodId: params.paymentMethod.id,
    livemode: billingPeriod.livemode,
    isAdjustment,
  }
}

export const createBillingRun = async (
  params: CreateBillingRunInsertParams,
  transaction: DbTransaction
) => {
  const insert = createBillingRunInsert(params)
  const result = await safelyInsertBillingRun(insert, transaction)
  return result.unwrap()
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
    usageOverages: Pick<
      UsageBillingInfo,
      | 'usageMeterId'
      | 'balance'
      | 'priceId'
      | 'usageEventsPerUnit'
      | 'unitPrice'
      | 'usageEventIds'
    >[]
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
    usageOverages.flatMap(
      (usageOverage) => usageOverage.usageEventIds
    ),
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
          priceId: usageCost.priceId,
          usageEventsPerUnit: usageCost.usageEventsPerUnit,
          unitPrice: usageCost.unitPrice,
          livemode: usageCost.livemode,
          name: usageCost.name,
          description: usageCost.description,
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

export const billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts =
  ({
    invoiceId,
    billingPeriodItems,
    usageOverages,
    billingRunId,
  }: {
    billingRunId: string
    invoiceId: string
    billingPeriodItems: BillingPeriodItem.Record[]
    usageOverages: Omit<
      UsageBillingInfo,
      'usageEventIds' | 'usageMeterIdPriceId'
    >[]
  }): InvoiceLineItem.Insert[] => {
    const invoiceLineItemInserts: (
      | InvoiceLineItem.Insert
      | undefined
    )[] = billingPeriodItems.map((billingPeriodItem) => {
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

    const usageLineItemInserts = usageOverages.map((usageOverage) => {
      const insert: InvoiceLineItem.UsageInsert = {
        priceId: usageOverage.priceId,
        billingRunId,
        invoiceId,
        ledgerAccountCredit: usageOverage.balance,
        quantity:
          usageOverage.balance && usageOverage.usageEventsPerUnit
            ? usageOverage.balance / usageOverage.usageEventsPerUnit
            : 0,
        type: SubscriptionItemType.Usage,
        ledgerAccountId: usageOverage!.ledgerAccountId,
        livemode: usageOverage.livemode,
        price: usageOverage.unitPrice,
        description: `${usageOverage.name ?? ''}`,
      }
      return insert
    })
    return [...invoiceLineItemInserts, ...usageLineItemInserts]
      .filter((item) => item !== undefined)
      .filter((item) => item.quantity > 0)
  }

export const processOutstandingBalanceForBillingPeriod = async (
  billingPeriod: BillingPeriod.Record,
  invoice: Invoice.Record,
  transaction: DbTransaction
): Promise<BillingPeriod.Record> => {
  if (
    Date.now() > billingPeriod.endDate &&
    billingPeriod.status !== BillingPeriodStatus.PastDue
  ) {
    await safelyUpdateInvoiceStatus(
      invoice,
      InvoiceStatus.Open,
      transaction
    )

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

  // For doNotCharge subscriptions, skip usage overages - they're recorded but not charged
  const { rawOutstandingUsageCosts } =
    await tabulateOutstandingUsageCosts(
      billingPeriod.subscriptionId,
      new Date(billingPeriod.endDate),
      transaction
    )
  const usageOverages = subscription.doNotCharge
    ? []
    : rawOutstandingUsageCosts

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

  // Calculate the actual amount to charge after accounting for existing payments
  // This is the amount that will be sent to Stripe
  const amountToCharge = Math.max(0, totalDueAmount - totalAmountPaid)

  let invoice: Invoice.Record | undefined

  // For adjustment billing runs, always create a new invoice for the proration charge
  // The existing invoice (if any) is for the original subscription payment
  if (billingRun.isAdjustment) {
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
  } else {
    // For regular billing runs, check for existing invoice on the billing period
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
     * Note: This only applies to regular billing runs, not adjustment runs
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
        amountToCharge,
        payments,
      }
    }
  }

  /**
   * "Evict" the invoice line items for the invoice
   * That way we can ensure the line items inserted are "fresh".
   */
  await deleteInvoiceLineItemsByinvoiceId(invoice.id, transaction)

  const invoiceLineItemInserts =
    billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
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
      amountToCharge,
      payments,
    }
  }

  /**
   * Guard: Only create a payment record if there's actually an amount to charge.
   * This prevents orphaned $0 payment records when the invoice is already fully
   * paid via credits or prior payments (amountToCharge = 0).
   * This check must come BEFORE Stripe ID validation since we don't need
   * Stripe IDs when there's nothing to charge.
   * See: https://github.com/flowglad/flowglad/issues/1317
   */
  if (amountToCharge <= 0) {
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
      amountToCharge,
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
    amount: amountToCharge,
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
    subtotal: feeCalculation.pretaxTotal,
    taxAmount: feeCalculation.taxAmountFixed,
    stripeTaxCalculationId: feeCalculation.stripeTaxCalculationId,
    stripeTaxTransactionId: feeCalculation.stripeTaxTransactionId,
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
    amountToCharge,
    payments,
  }
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
  amountToCharge: number
  payments: Payment.Record[]
  paymentIntent?: Stripe.Response<Stripe.PaymentIntent> | null
}

export const isFirstPayment = async (
  subscription: Subscription.Record,
  transaction: DbTransaction
): Promise<boolean> => {
  // Get all successful, non-zero payments for this subscription
  const payments = await selectPayments(
    {
      subscriptionId: subscription.id,
      status: PaymentStatus.Succeeded,
    },
    transaction
  )

  // Check if any payment has a non-zero amount
  const hasNonZeroPayment = payments.some(
    (payment) => payment.amount > 0
  )

  // If no successful non-zero payments exist, this is the first payment
  return !hasNonZeroPayment
}

/**
 * FIXME : support discount redemptions
 * @param billingRunId - billing run ID
 * @param adjustmentParams - Optional adjustment parameters for adjustment billing runs
 */
export const executeBillingRun = async (
  billingRunId: string,
  adjustmentParams?: {
    newSubscriptionItems: (
      | SubscriptionItem.Insert
      | SubscriptionItem.Record
    )[]
    adjustmentDate: Date | number
  }
) => {
  const billingRun = await adminTransaction(({ transaction }) => {
    return selectBillingRunById(billingRunId, transaction)
  })

  if (billingRun.status !== BillingRunStatus.Scheduled) {
    return
  }
  try {
    if (billingRun.isAdjustment && !adjustmentParams) {
      throw new Error(
        `executeBillingRun: Adjustment billing run ${billingRunId} requires adjustmentParams`
      )
    }

    const {
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
      paymentIntent,
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

          // Use the pre-calculated amountToCharge from the billing run calculation step
          // This is the actual amount that will be charged to Stripe
          const { amountToCharge } = resultFromSteps

          if (amountToCharge <= 0) {
            await updateInvoice(
              {
                ...resultFromSteps.invoice,
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
            return Result.ok({
              ...resultFromSteps,
              paymentIntent: null,
            })
          }

          // Create payment intent within the transaction
          let paymentIntent = null
          if (resultFromSteps.payment) {
            if (!resultFromSteps.customer.stripeCustomerId) {
              throw new Error(
                `Cannot run billing for a billing period with a customer that does not have a stripe customer id.` +
                  ` Customer: ${resultFromSteps.customer.id}; Billing Period: ${resultFromSteps.billingPeriod.id}`
              )
            }
            if (
              !resultFromSteps.paymentMethod.stripePaymentMethodId
            ) {
              throw new Error(
                `Cannot run billing for a billing period with a payment method that does not have a stripe payment method id.` +
                  `Payment Method: ${resultFromSteps.paymentMethod.id}; Billing Period: ${resultFromSteps.billingPeriod.id}`
              )
            }

            paymentIntent = await createPaymentIntentForBillingRun({
              amount: amountToCharge,
              currency: resultFromSteps.invoice.currency,
              stripeCustomerId:
                resultFromSteps.customer.stripeCustomerId,
              stripePaymentMethodId:
                resultFromSteps.paymentMethod.stripePaymentMethodId,
              billingPeriodId: billingRun.billingPeriodId,
              billingRunId: billingRun.id,
              feeCalculation: resultFromSteps.feeCalculation,
              organization: resultFromSteps.organization,
              livemode: billingRun.livemode,
            })

            // Update payment record with payment intent ID
            await updatePayment(
              {
                id: resultFromSteps.payment.id,
                stripePaymentIntentId: paymentIntent.id,
              },
              transaction
            )
            await updateInvoice(
              {
                id: resultFromSteps.invoice.id,
                stripePaymentIntentId: paymentIntent.id,
                purchaseId: resultFromSteps.invoice.purchaseId,
                billingPeriodId:
                  resultFromSteps.invoice.billingPeriodId,
                type: resultFromSteps.invoice.type,
                subscriptionId:
                  resultFromSteps.invoice.subscriptionId,
                billingRunId: billingRun.id,
              } as Invoice.Update,
              transaction
            )
            await safelyUpdateInvoiceStatus(
              resultFromSteps.invoice,
              InvoiceStatus.Open,
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
          }

          return Result.ok({
            ...resultFromSteps,
            paymentIntent,
          })
        },
        {
          livemode: billingRun.livemode,
        }
      )

    // Trigger PDF generation as a non-failing side effect
    if (!core.IS_TEST) {
      await tracedTrigger(
        'generateInvoicePdf',
        () =>
          generateInvoicePdfTask.trigger({
            invoiceId: invoice.id,
          }),
        { 'trigger.invoice_id': invoice.id }
      )
    }

    // Only proceed with payment confirmation if there is a payment intent
    if (!paymentIntent) {
      return
    }

    // Confirm payment intent (outside transaction)
    const confirmationResult =
      await confirmPaymentIntentForBillingRun(
        paymentIntent.id,
        billingRun.livemode
      )

    // Update payment record with charge ID
    if (payment) {
      await adminTransaction(
        async ({ transaction }) => {
          await updatePayment(
            {
              id: payment.id,
              stripeChargeId: confirmationResult.latest_charge
                ? stripeIdFromObjectOrId(
                    confirmationResult.latest_charge
                  )
                : null,
            },
            transaction
          )
        },
        {
          livemode: billingRun.livemode,
        }
      )
    }

    // Process payment intent in comprehensive transaction if payment intent in terminal state
    if (
      confirmationResult.status === 'succeeded' ||
      confirmationResult.status === 'requires_payment_method'
    ) {
      await comprehensiveAdminTransaction(async (params) => {
        const effectsCtx: TransactionEffectsContext = {
          transaction: params.transaction,
          cacheRecomputationContext: params.cacheRecomputationContext,
          invalidateCache: params.invalidateCache,
          emitEvent: params.emitEvent,
          enqueueLedgerCommand: params.enqueueLedgerCommand,
        }
        const result = await processOutcomeForBillingRun(
          {
            input: confirmationResult,
            adjustmentParams: adjustmentParams,
          },
          effectsCtx
        )
        return Result.ok(result)
      })
    }

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
      const isError = error instanceof Error
      return updateBillingRun(
        {
          id: billingRun.id,
          status: BillingRunStatus.Failed,
          errorDetails: {
            message: isError ? error.message : String(error),
            name: isError ? error.name : 'Error',
            stack: isError ? error.stack : undefined,
          },
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
  billingRun: BillingRun.Record
): BillingRun.Insert | undefined => {
  /**
   * FIXME: mark the subscription as canceled (?)
   */
  const nextAttemptNumber = billingRun.attemptNumber + 1

  // Check if we've exceeded max retries
  // retryTimesInDays.length + 1 = max attempts (1 original + retries)
  if (nextAttemptNumber > retryTimesInDays.length + 1) {
    return undefined
  }

  // Get the retry delay for this attempt number
  // attemptNumber 1 -> retryTimesInDays[0] (first retry, 3 days)
  // attemptNumber 2 -> retryTimesInDays[1] (second retry, 5 days)
  // attemptNumber 3 -> retryTimesInDays[2] (third retry, 5 days)
  const daysFromNowToRetry = retryTimesInDays[nextAttemptNumber - 2]

  return {
    billingPeriodId: billingRun.billingPeriodId,
    status: BillingRunStatus.Scheduled,
    scheduledFor: Date.now() + daysFromNowToRetry * dayInMilliseconds,
    subscriptionId: billingRun.subscriptionId,
    paymentMethodId: billingRun.paymentMethodId,
    livemode: billingRun.livemode,
    stripePaymentIntentId: billingRun.stripePaymentIntentId,
    lastPaymentIntentEventTimestamp:
      billingRun.lastPaymentIntentEventTimestamp,
    // Set attemptNumber to the next attempt
    attemptNumber: nextAttemptNumber,
  }
}

export const scheduleBillingRunRetry = async (
  billingRun: BillingRun.Record,
  transaction: DbTransaction
) => {
  const retryBillingRun = constructBillingRunRetryInsert(billingRun)
  if (!retryBillingRun) {
    return
  }
  const result = await safelyInsertBillingRun(
    retryBillingRun,
    transaction
  )
  return result.unwrap()
}
