import { createHash } from 'node:crypto'
import { FlowgladEventType } from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import { Event } from '@db-core/schema/events'
import type { Payment } from '@db-core/schema/payments'
import type { Purchase } from '@db-core/schema/purchases'
import type { Subscription } from '@db-core/schema/subscriptions'

function constructEventHash(record: Record<string, any>) {
  return createHash('sha256')
    .update(JSON.stringify(record))
    .digest('hex')
}

export function constructSubscriptionCreatedEventHash(
  subscription: Pick<Subscription.Record, 'id'>
) {
  return constructEventHash({
    type: FlowgladEventType.SubscriptionCreated,
    id: subscription.id,
  })
}

export function constructSubscriptionCanceledEventHash(
  subscription: Pick<Subscription.Record, 'id'>
) {
  return constructEventHash({
    type: FlowgladEventType.SubscriptionCanceled,
    id: subscription.id,
  })
}

export function constructPaymentSucceededEventHash(
  payment: Pick<Payment.Record, 'id'>
) {
  return constructEventHash({
    type: FlowgladEventType.PaymentSucceeded,
    id: payment.id,
  })
}

export function constructPurchaseCompletedEventHash(
  purchase: Pick<Purchase.Record, 'id'>
) {
  return constructEventHash({
    type: FlowgladEventType.PurchaseCompleted,
    id: purchase.id,
  })
}

export function constructPaymentFailedEventHash(
  payment: Pick<Payment.Record, 'id'>
) {
  return constructEventHash({
    type: FlowgladEventType.PaymentFailed,
    id: payment.id,
  })
}

export function constructCustomerCreatedEventHash(
  customer: Pick<Customer.Record, 'id'>
) {
  return constructEventHash({
    type: FlowgladEventType.CustomerCreated,
    id: customer.id,
  })
}

export function constructSyncEventsAvailableEventHash(params: {
  scopeId: string
  latestSequence: string
}) {
  return constructEventHash({
    type: FlowgladEventType.SyncEventsAvailable,
    scopeId: params.scopeId,
    latestSequence: params.latestSequence,
  })
}
