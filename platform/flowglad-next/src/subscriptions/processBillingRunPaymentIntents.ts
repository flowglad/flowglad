import { Invoice } from '@/db/schema/invoices'
import {
  selectBillingRunById,
  updateBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import {
  safelyUpdateInvoiceStatus,
  selectInvoices,
  updateInvoice,
} from '@/db/tableMethods/invoiceMethods'
import {
  BillingRunStatus,
  InvoiceStatus,
  LedgerTransactionType,
  SubscriptionStatus,
} from '@/types'
import { DbTransaction } from '@/db/types'
import {
  billingRunIntentMetadataSchema,
  dateFromStripeTimestamp,
  stripeIdFromObjectOrId,
} from '@/utils/stripe'
import Stripe from 'stripe'
import {
  calculateFeeAndTotalAmountDueForBillingPeriod,
  processNoMoreDueForBillingPeriod,
  processOutstandingBalanceForBillingPeriod,
  scheduleBillingRunRetry,
} from './billingRunHelpers'
import { Customer } from '@/db/schema/customers'
import { Organization } from '@/db/schema/organizations'
import { Subscription } from '@/db/schema/subscriptions'
import { sumNetTotalSettledPaymentsForBillingPeriod } from '@/utils/paymentHelpers'
import {
  sendAwaitingPaymentConfirmationEmail,
  sendOrganizationPaymentFailedNotificationEmail,
  sendOrganizationPaymentNotificationEmail,
  sendPaymentFailedEmail,
} from '@/utils/email'
import { Payment } from '@/db/schema/payments'
import { User } from '@/db/schema/users'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import {
  selectInvoiceLineItems,
  selectInvoiceLineItemsAndInvoicesByInvoiceWhere,
} from '@/db/tableMethods/invoiceLineItemMethods'
import { fetchDiscountInfoForInvoice } from '@/utils/discountHelpers'
import { adminTransaction } from '@/db/adminTransaction'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import {
  safelyUpdateSubscriptionStatus,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId } from '@/db/tableMethods/billingPeriodItemMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { processPaymentIntentStatusUpdated } from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import { sendCustomerPaymentSucceededNotificationIdempotently } from '@/trigger/notifications/send-customer-payment-succeeded-notification'
import {
  aggregateOutstandingBalanceForUsageCosts,
  selectLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import { BillingRun } from '@/db/schema/billingRuns'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import { SettleInvoiceUsageCostsLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import { Event } from '@/db/schema/events'

type PaymentIntentEvent =
  | Stripe.PaymentIntentSucceededEvent
  | Stripe.PaymentIntentPaymentFailedEvent
  | Stripe.PaymentIntentCanceledEvent
  | Stripe.PaymentIntentProcessingEvent
  | Stripe.PaymentIntentRequiresActionEvent

const paymentIntentStatusToBillingRunStatus: Record<
  Stripe.PaymentIntent.Status,
  BillingRunStatus
> = {
  succeeded: BillingRunStatus.Succeeded,
  requires_payment_method: BillingRunStatus.Failed,
  requires_action: BillingRunStatus.InProgress,
  requires_capture: BillingRunStatus.InProgress,
  requires_confirmation: BillingRunStatus.InProgress,
  canceled: BillingRunStatus.Aborted,
  processing: BillingRunStatus.AwaitingPaymentConfirmation,
}

const billingRunStatusToInvoiceStatus: Record<
  BillingRunStatus,
  InvoiceStatus
> = {
  [BillingRunStatus.Succeeded]: InvoiceStatus.Paid,
  [BillingRunStatus.Failed]: InvoiceStatus.Open,
  [BillingRunStatus.Aborted]: InvoiceStatus.Open,
  [BillingRunStatus.AwaitingPaymentConfirmation]:
    InvoiceStatus.AwaitingPaymentConfirmation,
  [BillingRunStatus.Scheduled]: InvoiceStatus.Open,
  [BillingRunStatus.Abandoned]: InvoiceStatus.Open,
  [BillingRunStatus.InProgress]: InvoiceStatus.Open,
}

interface BillingRunNotificationParams {
  invoice: Invoice.Record
  customer: Customer.Record
  organization: Organization.Record
  subscription: Subscription.Record
  payment: Payment.Record
  organizationMemberUsers: User.Record[]
  invoiceLineItems: InvoiceLineItem.Record[]
}

const processSucceededNotifications = async (
  params: BillingRunNotificationParams
) => {
  await sendCustomerPaymentSucceededNotificationIdempotently(
    params.payment.id
  )
  await sendOrganizationPaymentNotificationEmail({
    organizationName: params.organization.name,
    amount: params.payment.amount,
    customerId: params.customer.id,
    to: params.organizationMemberUsers
      .filter((user) => user.email)
      .map((user) => user.email!),
    currency: params.invoice.currency,
    customerName: params.customer.name,
    customerEmail: params.customer.email,
  })
}

interface BillingRunFailureNotificationParams
  extends BillingRunNotificationParams {
  retryDate?: Date
}

const processFailedNotifications = async (
  params: BillingRunFailureNotificationParams
) => {
  const organizationName = params.organization.name
  const currency = params.invoice.currency

  // Fetch discount information if this invoice is from a billing period (subscription)
  const discountInfo = await fetchDiscountInfoForInvoice(
    params.invoice
  )

  await sendPaymentFailedEmail({
    organizationName: params.organization.name,
    to: [params.customer.email],
    invoiceNumber: params.invoice.invoiceNumber,
    orderDate: params.invoice.invoiceDate,
    invoice: {
      subtotal: params.invoice.subtotal,
      taxAmount: params.invoice.taxAmount,
      currency: params.invoice.currency,
    },
    lineItems: params.invoiceLineItems.map((item) => ({
      name: item.description ?? '',
      price: item.price,
      quantity: item.quantity,
    })),
    retryDate: params.retryDate,
    discountInfo,
  })

  await sendOrganizationPaymentFailedNotificationEmail({
    to: params.organizationMemberUsers
      .filter((user) => user.email)
      .map((user) => user.email!),
    organizationName,
    currency,
    customerId: params.customer.id,
    customerName: params.customer.name,
    amount: params.invoiceLineItems.reduce((acc, item) => {
      return item.price * item.quantity + acc
    }, 0),
  })
}

const processAbortedNotifications = (
  params: BillingRunNotificationParams
) => {}

const processAwaitingPaymentConfirmationNotifications = async (
  params: BillingRunNotificationParams
) => {
  await sendAwaitingPaymentConfirmationEmail({
    organizationName: params.organization.name,
    amount: params.payment.amount,
    customerId: params.customer.id,
    to: [params.customer.email],
    orderDate: params.invoice.invoiceDate,
    invoiceNumber: params.invoice.invoiceNumber,
    currency: params.invoice.currency,
    customerName: params.customer.name,
  })
}

export const processPaymentIntentEventForBillingRun = async (
  event: PaymentIntentEvent,
  transaction: DbTransaction
): Promise<
  TransactionOutput<{
    invoice: Invoice.Record
    invoiceLineItems: InvoiceLineItem.Record[]
    billingRun: BillingRun.Record
    payment: Payment.Record
    processingSkipped?: boolean
  }>
> => {
  const metadata = billingRunIntentMetadataSchema.parse(
    event.data.object.metadata
  )

  let billingRun = await selectBillingRunById(
    metadata.billingRunId,
    transaction
  )

  const eventTimestamp = dateFromStripeTimestamp(event.created)
  const eventPrecedesLastPaymentIntentEvent =
    billingRun.lastPaymentIntentEventTimestamp &&
    billingRun.lastPaymentIntentEventTimestamp >= eventTimestamp
  /**
   * If the last payment intent event timestamp is greater than the event timestamp being
   * processed, we can skip processing this event.
   * This helps avoid bugs caused by Stripe's no guarantees about out-of-order events.
   * And it is a workaround to avoid the need to implement a queue, for now.
   */
  if (eventPrecedesLastPaymentIntentEvent) {
    const [result] =
      await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
        {
          billingPeriodId: billingRun.billingPeriodId,
        },
        transaction
      )
    const [payment] = await selectPayments(
      {
        stripePaymentIntentId: event.data.object.id,
        stripeChargeId: stripeIdFromObjectOrId(
          event.data.object.latest_charge!
        ),
      },
      transaction
    )
    return {
      result: {
        invoice: result.invoice,
        invoiceLineItems: result.invoiceLineItems,
        billingRun,
        payment,
        processingSkipped: true,
      },
      ledgerCommand: undefined,
    }
  }

  const paymentMethod = await selectPaymentMethodById(
    billingRun.paymentMethodId,
    transaction
  )

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

  const billingRunStatus =
    paymentIntentStatusToBillingRunStatus[event.data.object.status]
  billingRun = await updateBillingRun(
    {
      id: billingRun.id,
      status: billingRunStatus,
      lastPaymentIntentEventTimestamp: eventTimestamp,
    },
    transaction
  )

  let [invoice] = await selectInvoices(
    {
      billingPeriodId: billingRun.billingPeriodId,
    },
    transaction
  )
  if (!invoice) {
    throw Error(
      `Invoice for billing period ${billingRun.billingPeriodId} not found.`
    )
  }

  const {
    result: { payment },
    eventsToInsert: childeventsToInsert,
  } = await processPaymentIntentStatusUpdated(
    event.data.object,
    transaction
  )

  const invoiceStatus =
    billingRunStatusToInvoiceStatus[billingRunStatus]
  invoice = await safelyUpdateInvoiceStatus(
    invoice,
    invoiceStatus,
    transaction
  )

  const invoiceLineItems = await selectInvoiceLineItems(
    {
      invoiceId: invoice.id,
    },
    transaction
  )
  const claimedLedgerEntries = await selectLedgerEntries(
    {
      claimedByBillingRunId: billingRun.id,
    },
    transaction
  )

  const overages = await aggregateOutstandingBalanceForUsageCosts(
    {
      ledgerAccountId: claimedLedgerEntries.map(
        (entry) => entry.ledgerAccountId!
      ),
    },
    billingPeriod.endDate,
    transaction
  )

  const { totalDueAmount } =
    await calculateFeeAndTotalAmountDueForBillingPeriod(
      {
        billingPeriodItems,
        billingPeriod,
        organization,
        paymentMethod,
        usageOverages: overages,
        billingRun,
      },
      transaction
    )

  const { total: totalPaidAmount } =
    await sumNetTotalSettledPaymentsForBillingPeriod(
      billingRun.billingPeriodId,
      transaction
    )

  if (totalPaidAmount >= totalDueAmount) {
    await processNoMoreDueForBillingPeriod(
      {
        billingRun,
        billingPeriod,
        invoice,
      },
      transaction
    )
  } else {
    await processOutstandingBalanceForBillingPeriod(
      billingPeriod,
      transaction
    )
  }

  const usersAndMemberships =
    await selectMembershipsAndUsersByMembershipWhere(
      {
        organizationId: organization.id,
      },
      transaction
    )

  const organizationMemberUsers = usersAndMemberships.map(
    (userAndMembership) => userAndMembership.user
  )
  const eventsToInsert: Event.Insert[] = []
  if (childeventsToInsert && childeventsToInsert.length > 0) {
    eventsToInsert.push(...childeventsToInsert)
  }

  const notificationParams: BillingRunNotificationParams = {
    invoice,
    customer,
    organization,
    subscription,
    payment,
    organizationMemberUsers,
    invoiceLineItems,
  }

  if (billingRunStatus === BillingRunStatus.Succeeded) {
    await safelyUpdateSubscriptionStatus(
      subscription,
      SubscriptionStatus.Active,
      transaction
    )
    await processSucceededNotifications(notificationParams)
  } else if (billingRunStatus === BillingRunStatus.Failed) {
    const maybeRetry = await scheduleBillingRunRetry(
      billingRun,
      transaction
    )
    await processFailedNotifications({
      ...notificationParams,
      retryDate: maybeRetry?.scheduledFor,
    })
    await safelyUpdateSubscriptionStatus(
      subscription,
      SubscriptionStatus.PastDue,
      transaction
    )
  } else if (billingRunStatus === BillingRunStatus.Aborted) {
    await processAbortedNotifications(notificationParams)
    await safelyUpdateSubscriptionStatus(
      subscription,
      SubscriptionStatus.PastDue,
      transaction
    )
  } else if (
    billingRunStatus === BillingRunStatus.AwaitingPaymentConfirmation
  ) {
    invoice = await updateInvoice(
      {
        id: invoice.id,
        status: InvoiceStatus.AwaitingPaymentConfirmation,
        purchaseId: invoice.purchaseId,
        billingPeriodId: invoice.billingPeriodId,
        subscriptionId: invoice.subscriptionId,
        type: invoice.type,
        billingRunId: invoice.billingRunId,
      } as Invoice.Update,
      transaction
    )
    await processAwaitingPaymentConfirmationNotifications(
      notificationParams
    )
  }

  const invoiceLedgerCommand:
    | SettleInvoiceUsageCostsLedgerCommand
    | undefined =
    invoice.status === InvoiceStatus.Paid
      ? {
          type: LedgerTransactionType.SettleInvoiceUsageCosts,
          payload: {
            invoice,
            invoiceLineItems,
          },
          livemode: invoice.livemode,
          organizationId: invoice.organizationId,
          subscriptionId: invoice.subscriptionId!,
        }
      : undefined

  return {
    result: {
      invoice,
      invoiceLineItems,
      billingRun,
      payment,
    },
    ledgerCommand: invoiceLedgerCommand,
    eventsToInsert,
  }
}

/**
 * Process payment intent succeeded
 */

/**
 * Process payment intent failed
 */

/**
 * Process payment intent canceled
 */

/**
 * Process payment intent processing
 */

/**
 * Process payment intent requires action
 */
