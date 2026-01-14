import type Stripe from 'stripe'
import type {
  BillingPeriodTransitionLedgerCommand,
  SettleInvoiceUsageCostsLedgerCommand,
} from '@/db/ledgerManager/ledgerManagerTypes'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { Payment } from '@/db/schema/payments'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import type { User } from '@/db/schema/users'
import { selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId } from '@/db/tableMethods/billingPeriodItemMethods'
import { selectBillingPeriods } from '@/db/tableMethods/billingPeriodMethods'
import {
  selectBillingRunById,
  updateBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import {
  deleteInvoiceLineItems,
  selectInvoiceLineItems,
  selectInvoiceLineItemsAndInvoicesByInvoiceWhere,
} from '@/db/tableMethods/invoiceLineItemMethods'
import {
  selectInvoiceById,
  selectInvoices,
  updateInvoice,
} from '@/db/tableMethods/invoiceMethods'
import {
  aggregateOutstandingBalanceForUsageCosts,
  selectLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { safelyUpdateSubscriptionStatus } from '@/db/tableMethods/subscriptionMethods'
import type { TransactionEffectsContext } from '@/db/types'
import { sendCustomerPaymentSucceededNotificationIdempotently } from '@/trigger/notifications/send-customer-payment-succeeded-notification'
import { idempotentSendCustomerSubscriptionAdjustedNotification } from '@/trigger/notifications/send-customer-subscription-adjusted-notification'
import { idempotentSendOrganizationSubscriptionAdjustedNotification } from '@/trigger/notifications/send-organization-subscription-adjusted-notification'
import {
  BillingRunStatus,
  FeatureType,
  InvoiceStatus,
  LedgerTransactionType,
  SubscriptionStatus,
} from '@/types'
import { processPaymentIntentStatusUpdated } from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import { createStripeTaxTransactionIfNeededForPayment } from '@/utils/bookkeeping/stripeTaxTransactions'
import { CacheDependency } from '@/utils/cache'
import { fetchDiscountInfoForInvoice } from '@/utils/discountHelpers'
import {
  sendAwaitingPaymentConfirmationEmail,
  sendOrganizationPaymentFailedNotificationEmail,
  sendOrganizationPaymentNotificationEmail,
  sendPaymentFailedEmail,
} from '@/utils/email'
import { sumNetTotalSettledPaymentsForBillingPeriod } from '@/utils/paymentHelpers'
import {
  billingRunIntentMetadataSchema,
  dateFromStripeTimestamp,
  stripeIdFromObjectOrId,
} from '@/utils/stripe'
import { syncSubscriptionWithActiveItems } from './adjustSubscription'
import {
  calculateFeeAndTotalAmountDueForBillingPeriod,
  isFirstPayment,
  processNoMoreDueForBillingPeriod,
  processOutstandingBalanceForBillingPeriod,
  scheduleBillingRunRetry,
} from './billingRunHelpers'
import { cancelSubscriptionImmediately } from './cancelSubscription'
import { handleSubscriptionItemAdjustment } from './subscriptionItemHelpers'

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

interface BillingRunNotificationParams {
  invoice: Invoice.Record
  customer: Customer.Record
  organization: Organization.Record
  subscription: Subscription.Record
  payment: Payment.Record
  organizationMemberUsers: User.Record[]
  invoiceLineItems: InvoiceLineItem.Record[]
}

interface ProcessOutcomeForBillingRunParams {
  input: PaymentIntentEvent | Stripe.PaymentIntent
  adjustmentParams?: {
    newSubscriptionItems: (
      | SubscriptionItem.Insert
      | SubscriptionItem.Record
    )[]
    adjustmentDate: Date | number
  }
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
    livemode: params.invoice.livemode,
  })
}

interface BillingRunFailureNotificationParams
  extends BillingRunNotificationParams {
  retryDate?: Date | number
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
    livemode: params.invoice.livemode,
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
    livemode: params.invoice.livemode,
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
    to: params.organizationMemberUsers
      .filter((user) => user.email)
      .map((user) => user.email!),
    invoiceNumber: params.invoice.invoiceNumber,
    currency: params.invoice.currency,
    customerName: params.customer.name,
    livemode: params.invoice.livemode,
  })
}

export const processOutcomeForBillingRun = async (
  params: ProcessOutcomeForBillingRunParams,
  ctx: TransactionEffectsContext
): Promise<{
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  billingRun: BillingRun.Record
  payment: Payment.Record
  processingSkipped?: boolean
}> => {
  const {
    transaction,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
  } = ctx
  const { input, adjustmentParams } = params
  const event = 'type' in input ? input.data.object : input
  const timestamp = 'type' in input ? input.created : event.created

  const metadata = billingRunIntentMetadataSchema.parse(
    event.metadata
  )

  let billingRun = await selectBillingRunById(
    metadata.billingRunId,
    transaction
  )

  const eventTimestamp = dateFromStripeTimestamp(timestamp)
  const eventPrecedesLastPaymentIntentEvent =
    billingRun.lastPaymentIntentEventTimestamp &&
    billingRun.lastPaymentIntentEventTimestamp >=
      eventTimestamp.getTime()
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
        stripePaymentIntentId: event.id,
        stripeChargeId: stripeIdFromObjectOrId(event.latest_charge!),
      },
      transaction
    )
    return {
      invoice: result.invoice,
      invoiceLineItems: result.invoiceLineItems,
      billingRun,
      payment,
      processingSkipped: true,
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
    paymentIntentStatusToBillingRunStatus[event.status]
  billingRun = await updateBillingRun(
    {
      id: billingRun.id,
      status: billingRunStatus,
      lastPaymentIntentEventTimestamp: eventTimestamp.getTime(),
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
  const { payment } = await processPaymentIntentStatusUpdated(
    event,
    ctx
  )

  if (billingRunStatus === BillingRunStatus.Succeeded) {
    await createStripeTaxTransactionIfNeededForPayment(
      { organization, payment, invoice },
      transaction
    )
  }

  /**
   * If there is a payment failure and we are on an adjustment billing run
   * then we should delete the evidence of an attempt to adjust from the invoice
   * and early exit
   */
  const paymentFailed =
    billingRunStatus === BillingRunStatus.Failed ||
    billingRunStatus === BillingRunStatus.Aborted
  if (billingRun.isAdjustment && paymentFailed) {
    const invoiceLineItems = await selectInvoiceLineItems(
      {
        invoiceId: invoice.id,
        billingRunId: billingRun.id,
      },
      transaction
    )

    if (invoiceLineItems.length > 0) {
      await deleteInvoiceLineItems(
        invoiceLineItems.map((item) => ({ id: item.id })),
        transaction
      )
    }

    return {
      invoice,
      invoiceLineItems: [],
      billingRun,
      payment,
    }
  }

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
    new Date(billingPeriod.endDate),
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
      invoice,
      transaction
    )
  }

  // Re-Select Invoice after changes have been made
  invoice = await selectInvoiceById(invoice.id, transaction)

  // Track subscription item adjustment result for cache invalidation
  let subscriptionItemAdjustmentResult:
    | Awaited<ReturnType<typeof handleSubscriptionItemAdjustment>>
    | undefined

  // Handle subscription item adjustments after successful payment
  if (
    billingRun.isAdjustment &&
    adjustmentParams &&
    billingRunStatus === BillingRunStatus.Succeeded
  ) {
    // Get existing items BEFORE the adjustment for notification
    const existingSubscriptionItems =
      await selectCurrentlyActiveSubscriptionItems(
        { subscriptionId: subscription.id },
        new Date(),
        transaction
      )

    subscriptionItemAdjustmentResult =
      await handleSubscriptionItemAdjustment({
        subscriptionId: subscription.id,
        newSubscriptionItems: adjustmentParams.newSubscriptionItems,
        adjustmentDate: adjustmentParams.adjustmentDate,
        transaction,
      })

    // Sync subscription record with updated items
    await syncSubscriptionWithActiveItems(
      {
        subscriptionId: subscription.id,
        currentTime: adjustmentParams.adjustmentDate,
      },
      transaction
    )

    // Send upgrade notifications AFTER payment succeeded and items updated
    const price = await selectPriceById(
      subscription.priceId,
      transaction
    )

    if (!price) {
      throw new Error(
        `Price ${subscription.priceId} not found for subscription ${subscription.id}`
      )
    }

    // Calculate proration amount from billing period items
    // Proration items are created in adjustSubscription.ts with name "Proration: Net charge adjustment"
    const prorationAmount = billingPeriodItems
      .filter((item) => item.name.startsWith('Proration:'))
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

    await idempotentSendCustomerSubscriptionAdjustedNotification({
      subscriptionId: subscription.id,
      customerId: customer.id,
      organizationId: organization.id,
      adjustmentType: 'upgrade',
      previousItems: existingSubscriptionItems.map((item) => ({
        name: item.name ?? '',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
      newItems: adjustmentParams.newSubscriptionItems.map((item) => ({
        name: item.name ?? '',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
      prorationAmount,
      effectiveDate:
        typeof adjustmentParams.adjustmentDate === 'number'
          ? adjustmentParams.adjustmentDate
          : adjustmentParams.adjustmentDate.getTime(),
    })

    await idempotentSendOrganizationSubscriptionAdjustedNotification({
      subscriptionId: subscription.id,
      customerId: customer.id,
      organizationId: organization.id,
      adjustmentType: 'upgrade',
      previousItems: existingSubscriptionItems.map((item) => ({
        name: item.name ?? '',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
      newItems: adjustmentParams.newSubscriptionItems.map((item) => ({
        name: item.name ?? '',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
      prorationAmount,
      effectiveDate:
        typeof adjustmentParams.adjustmentDate === 'number'
          ? adjustmentParams.adjustmentDate
          : adjustmentParams.adjustmentDate.getTime(),
      currency: price.currency,
    })
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

  // Queue cache invalidations via effects context
  invalidateCache(
    CacheDependency.customerSubscriptions(subscription.customerId)
  )
  // Also invalidate any cache keys from subscription item adjustments
  if (subscriptionItemAdjustmentResult?.cacheInvalidations) {
    invalidateCache(
      ...subscriptionItemAdjustmentResult.cacheInvalidations
    )
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
    const firstPayment = await isFirstPayment(
      subscription,
      transaction
    )

    // Do not cancel if first payment fails for free or default plans
    if (firstPayment && !subscription.isFreePlan) {
      // First payment failure - cancel subscription immediately
      await cancelSubscriptionImmediately({ subscription }, ctx)
    } else {
      // nth payment failures logic
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
    }
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
    await processAwaitingPaymentConfirmationNotifications({
      ...notificationParams,
      invoice, // Use the updated invoice
    })
  }

  if (
    event.status === 'succeeded' &&
    invoice.status === InvoiceStatus.Paid
  ) {
    const activeSubscriptionItems =
      await selectCurrentlyActiveSubscriptionItems(
        { subscriptionId: subscription.id },
        billingPeriod.startDate,
        transaction
      )

    const subscriptionItemFeatures =
      await selectSubscriptionItemFeatures(
        {
          subscriptionItemId: activeSubscriptionItems.map(
            (item) => item.id
          ),
          type: FeatureType.UsageCreditGrant,
        },
        transaction
      )

    // Find previous billing period (if any)
    const allBillingPeriods = await selectBillingPeriods(
      { subscriptionId: subscription.id },
      transaction
    )

    // Find the billing period that comes before this one (by startDate)
    const previousBillingPeriod =
      allBillingPeriods
        .filter((bp) => bp.startDate < billingPeriod.startDate)
        .sort((a, b) => b.startDate - a.startDate)[0] || null

    // Enqueue billing period transition command
    enqueueLedgerCommand({
      type: LedgerTransactionType.BillingPeriodTransition,
      organizationId: organization.id,
      subscriptionId: subscription.id,
      livemode: billingPeriod.livemode,
      payload: {
        type: 'standard',
        subscription,
        previousBillingPeriod,
        newBillingPeriod: billingPeriod,
        subscriptionFeatureItems: subscriptionItemFeatures.filter(
          (item) => item.type === FeatureType.UsageCreditGrant
        ),
      },
    } satisfies BillingPeriodTransitionLedgerCommand)
  }

  if (invoice.status === InvoiceStatus.Paid) {
    enqueueLedgerCommand({
      type: LedgerTransactionType.SettleInvoiceUsageCosts,
      payload: {
        invoice,
        invoiceLineItems,
      },
      livemode: invoice.livemode,
      organizationId: invoice.organizationId,
      subscriptionId: invoice.subscriptionId!,
    } satisfies SettleInvoiceUsageCostsLedgerCommand)
  }

  return {
    invoice,
    invoiceLineItems,
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
