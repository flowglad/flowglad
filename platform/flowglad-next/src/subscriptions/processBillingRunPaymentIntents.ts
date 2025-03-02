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
  PaymentStatus,
  SubscriptionStatus,
} from '@/types'
import { DbTransaction } from '@/db/types'
import {
  billingRunIntentMetadataSchema,
  dateFromStripeTimestamp,
  getStripeCharge,
  stripeIdFromObjectOrId,
} from '@/utils/stripe'
import Stripe from 'stripe'
import {
  calculateFeeAndTotalAmountDueForBillingPeriod,
  processNoMoreDueForBillingPeriod,
  processOutstandingBalanceForBillingPeriod,
  scheduleBillingRunRetry,
} from './billingRunHelpers'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { Organization } from '@/db/schema/organizations'
import { Subscription } from '@/db/schema/subscriptions'
import { sumNetTotalSettledPaymentsForBillingPeriod } from '@/db/tableMethods/paymentMethods'
import {
  sendAwaitingPaymentConfirmationEmail,
  sendOrganizationPaymentNotificationEmail,
  sendPaymentFailedEmail,
  sendReceiptEmail,
} from '@/utils/email'
import { Payment } from '@/db/schema/payments'
import { UserRecord } from '@/db/schema/users'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectInvoiceLineItems } from '@/db/tableMethods/invoiceLineItemMethods'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { subscriptionBillingInfoCoreWithTrial } from '@/stubs/billingInfoStubs'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId } from '@/db/tableMethods/billingPeriodItemMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { processPaymentIntentStatusUpdated } from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'

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

const paymentIntentStatusToPaymentStatus: Record<
  Stripe.PaymentIntent.Status,
  PaymentStatus
> = {
  succeeded: PaymentStatus.Succeeded,
  canceled: PaymentStatus.Canceled,
  requires_payment_method: PaymentStatus.Canceled,
  requires_action: PaymentStatus.RequiresAction,
  requires_capture: PaymentStatus.Processing,
  requires_confirmation: PaymentStatus.RequiresConfirmation,
  processing: PaymentStatus.Processing,
}

interface BillingRunNotificationParams {
  invoice: Invoice.Record
  customerProfile: CustomerProfile.Record
  organization: Organization.Record
  subscription: Subscription.Record
  payment: Payment.Record
  organizationMemberUsers: UserRecord[]
  invoiceLineItems: InvoiceLineItem.Record[]
}

const processSucceededNotifications = async (
  params: BillingRunNotificationParams
) => {
  await sendOrganizationPaymentNotificationEmail({
    organizationName: params.organization.name,
    amount: params.payment.amount,
    customerProfileId: params.customerProfile.id,
    to: params.organizationMemberUsers
      .filter((user) => user.email)
      .map((user) => user.email!),
    currency: params.invoice.currency,
  })
  await sendReceiptEmail({
    invoice: params.invoice,
    invoiceLineItems: params.invoiceLineItems,
    organizationName: params.organization.name,
    to: [params.customerProfile.email],
  })
}

interface BillingRunFailureNotificationParams
  extends BillingRunNotificationParams {
  retryDate?: Date
}

const processFailedNotifications = async (
  params: BillingRunFailureNotificationParams
) => {
  await sendPaymentFailedEmail({
    organizationName: params.organization.name,
    to: [params.customerProfile.email],
    invoiceNumber: params.invoice.invoiceNumber,
    orderDate: params.invoice.invoiceDate,
    lineItems: params.invoiceLineItems.map((item) => ({
      name: item.description ?? '',
      price: item.price,
      quantity: item.quantity,
    })),
    retryDate: params.retryDate,
    currency: params.invoice.currency,
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
    customerProfileId: params.customerProfile.id,
    to: [params.customerProfile.email],
    orderDate: params.invoice.invoiceDate,
    invoiceNumber: params.invoice.invoiceNumber,
    currency: params.invoice.currency,
  })
}

export const processPaymentIntentEventForBillingRun = async (
  event: PaymentIntentEvent,
  transaction: DbTransaction
) => {
  const metadata = billingRunIntentMetadataSchema.parse(
    event.data.object.metadata
  )

  let billingRun = await selectBillingRunById(
    metadata.billingRunId,
    transaction
  )
  if (billingRun.stripePaymentIntentId !== event.data.object.id) {
    throw Error(
      `Aborting billing run update: Billing run ${billingRun.id} has a different stripe payment intent id than the event ${event.data.object.id}`
    )
  }

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
    return
  }

  const paymentMethod = await selectPaymentMethodById(
    billingRun.PaymentMethodId,
    transaction
  )

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
      BillingPeriodId: billingRun.BillingPeriodId,
    },
    transaction
  )
  if (!invoice) {
    throw Error(
      `Invoice for billing period ${billingRun.BillingPeriodId} not found.`
    )
  }

  const { payment } = await processPaymentIntentStatusUpdated(
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
      InvoiceId: invoice.id,
    },
    transaction
  )

  const { totalDueAmount } =
    await calculateFeeAndTotalAmountDueForBillingPeriod(
      {
        billingPeriodItems,
        billingPeriod,
        organization,
        paymentMethod,
      },
      transaction
    )

  const { total: totalPaidAmount } =
    await sumNetTotalSettledPaymentsForBillingPeriod(
      billingRun.BillingPeriodId,
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
        OrganizationId: organization.id,
      },
      transaction
    )

  const organizationMemberUsers = usersAndMemberships.map(
    (userAndMembership) => userAndMembership.user
  )
  const notificationParams: BillingRunNotificationParams = {
    invoice,
    customerProfile,
    organization,
    subscription,
    payment,
    organizationMemberUsers,
    invoiceLineItems,
  }
  if (billingRunStatus === BillingRunStatus.Succeeded) {
    await processSucceededNotifications(notificationParams)
    await updateSubscription(
      {
        id: subscription.id,
        status: SubscriptionStatus.Active,
      },
      transaction
    )
  } else if (billingRunStatus === BillingRunStatus.Failed) {
    const maybeRetry = await scheduleBillingRunRetry(
      billingRun,
      transaction
    )
    await processFailedNotifications({
      ...notificationParams,
      retryDate: maybeRetry?.scheduledFor,
    })
    await updateSubscription(
      {
        id: subscription.id,
        status: SubscriptionStatus.PastDue,
      },
      transaction
    )
  } else if (billingRunStatus === BillingRunStatus.Aborted) {
    await processAbortedNotifications(notificationParams)
    await updateSubscription(
      {
        id: subscription.id,
        status: SubscriptionStatus.PastDue,
      },
      transaction
    )
  } else if (
    billingRunStatus === BillingRunStatus.AwaitingPaymentConfirmation
  ) {
    invoice = await updateInvoice(
      {
        id: invoice.id,
        status: InvoiceStatus.AwaitingPaymentConfirmation,
        PurchaseId: invoice.PurchaseId,
        BillingPeriodId: invoice.BillingPeriodId,
        type: invoice.type,
      } as Invoice.Update,
      transaction
    )
    await processAwaitingPaymentConfirmationNotifications(
      notificationParams
    )
  }

  return {
    invoice,
    billingRun,
    payment,
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
