import { Customer } from '@/db/schema/customers'
import { Event } from '@/db/schema/events'
import { Payment } from '@/db/schema/payments'
import { Purchase } from '@/db/schema/purchases'
import { Subscription } from '@/db/schema/subscriptions'
import { FlowgladEventType } from '@/types'
import { createHash } from 'node:crypto'

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

export function constructPaymentSucceededEventHash(
  payment: Pick<Payment.Record, 'id'>
) {
  return constructEventHash({
    type: FlowgladEventType.PaymentSucceeded,
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

export function constructPurchaseCompletedEventHash(
  purchase: Pick<Purchase.Record, 'id'>
) {
  return constructEventHash({
    type: FlowgladEventType.PurchaseCompleted,
    id: purchase.id,
  })
}
