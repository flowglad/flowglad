import type { Customer } from '@/db/schema/customers'
import type { Event } from '@/db/schema/events'
import type { Payment } from '@/db/schema/payments'
import type { Purchase } from '@/db/schema/purchases'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
  derivePricingModelIdFromEventPayload,
  upsertEventByHash,
} from '@/db/tableMethods/eventMethods'
import type { DbTransaction } from '@/db/types'
import {
  EventCategory,
  EventNoun,
  EventRetentionPolicy,
  FlowgladEventType,
} from '@/types'
import { hashData } from './backendCore'

export interface CreateEventPayload {
  type: FlowgladEventType
  eventCategory: EventCategory
  source: EventNoun
  payload: Event.Record['payload']
  organizationId: string
  livemode: boolean
}

export const commitEvent = async (
  payload: CreateEventPayload,
  transaction: DbTransaction
) => {
  const now = Date.now()
  const pricingModelId = await derivePricingModelIdFromEventPayload(
    payload.payload,
    transaction
  )
  return upsertEventByHash(
    {
      type: payload.type,
      submittedAt: now,
      occurredAt: now,
      payload: payload.payload,
      hash: hashData(JSON.stringify(payload.payload)),
      metadata: {},
      objectEntity: null,
      objectId: null,
      processedAt: null,
      organizationId: payload.organizationId,
      livemode: payload.livemode,
      pricingModelId,
    },
    transaction
  )
}

/**
 * FIXME: restore this, but with native subscription implementation
 * @param payment
 * @param transaction
 * @returns
 */
// export const commitSubscriptionCreatedEvent = async (
//   payload: {
//     organizationId: string
//     stripeSubscriptionCreatedEvent: Stripe.CustomerSubscriptionCreatedEvent
//   },
//   transaction: DbTransaction
// ) => {
//   return commitEvent(
//     {
//       type: FlowgladEventType.SubscriptionCreated,
//       eventCategory: EventCategory.Financial,
//       source: EventNoun.Purchase,
//       payload: generateEventPayload(payload),
//       organizationId: payload.organizationId,
//       livemode: payload.stripeSubscriptionCreatedEvent.livemode,
//     },
//     transaction
//   )
// }

export const commitPaymentSucceededEvent = async (
  payment: Payment.Record,
  transaction: DbTransaction
) => {
  const customer = await selectCustomerById(
    payment.customerId,
    transaction
  )

  if (!customer) {
    throw new Error(`Customer not found for payment ${payment.id}`)
  }

  return commitEvent(
    {
      type: FlowgladEventType.PaymentSucceeded,
      eventCategory: EventCategory.Financial,
      source: EventNoun.Payment,
      payload: {
        id: payment.id,
        object: EventNoun.Payment,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      organizationId: payment.organizationId,
      livemode: payment.livemode,
    },
    transaction
  )
}

export const commitPaymentCanceledEvent = async (
  payment: Payment.Record,
  transaction: DbTransaction
) => {
  const customer = await selectCustomerById(
    payment.customerId,
    transaction
  )

  if (!customer) {
    throw new Error(`Customer not found for payment ${payment.id}`)
  }

  return commitEvent(
    {
      type: FlowgladEventType.PaymentFailed,
      eventCategory: EventCategory.Financial,
      source: EventNoun.Payment,
      payload: {
        id: payment.id,
        object: EventNoun.Payment,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      organizationId: payment.organizationId,
      livemode: payment.livemode,
    },
    transaction
  )
}

export const commitCustomerCreatedEvent = async (
  customer: Customer.Record,
  transaction: DbTransaction
) => {
  return commitEvent(
    {
      type: FlowgladEventType.CustomerCreated,
      eventCategory: EventCategory.Customer,
      source: EventNoun.Customer,
      payload: {
        id: customer.id,
        object: EventNoun.Customer,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      organizationId: customer.organizationId,
      livemode: customer.livemode,
    },
    transaction
  )
}

export const commitCustomerUpdatedEvent = async (
  customer: Customer.Record,
  transaction: DbTransaction
) => {
  return commitEvent(
    {
      type: FlowgladEventType.CustomerUpdated,
      eventCategory: EventCategory.Customer,
      source: EventNoun.Customer,
      payload: {
        id: customer.id,
        object: EventNoun.Customer,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      organizationId: customer.organizationId,
      livemode: customer.livemode,
    },
    transaction
  )
}

export const commitPurchaseCompletedEvent = async (
  purchase: Purchase.Record,
  transaction: DbTransaction
) => {
  const customer = await selectCustomerById(
    purchase.customerId,
    transaction
  )

  if (!customer) {
    throw new Error(`Customer not found for purchase ${purchase.id}`)
  }

  return commitEvent(
    {
      type: FlowgladEventType.PurchaseCompleted,
      eventCategory: EventCategory.Financial,
      source: EventNoun.Purchase,
      payload: {
        id: purchase.id,
        object: EventNoun.Purchase,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      organizationId: purchase.organizationId,
      livemode: purchase.livemode,
    },
    transaction
  )
}

export const commitSubscriptionCreatedEvent = async (
  subscription: Subscription.Record,
  transaction: DbTransaction
) => {
  const customer = await selectCustomerById(
    subscription.customerId,
    transaction
  )

  if (!customer) {
    throw new Error(
      `Customer not found for subscription ${subscription.id}`
    )
  }

  return commitEvent(
    {
      type: FlowgladEventType.SubscriptionCreated,
      eventCategory: EventCategory.Subscription,
      source: EventNoun.Subscription,
      payload: {
        id: subscription.id,
        object: EventNoun.Subscription,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      organizationId: subscription.organizationId,
      livemode: subscription.livemode,
    },
    transaction
  )
}

export const commitSubscriptionUpdatedEvent = async (
  subscription: Subscription.Record,
  transaction: DbTransaction
) => {
  const customer = await selectCustomerById(
    subscription.customerId,
    transaction
  )

  if (!customer) {
    throw new Error(
      `Customer not found for subscription ${subscription.id}`
    )
  }

  return commitEvent(
    {
      type: FlowgladEventType.SubscriptionUpdated,
      eventCategory: EventCategory.Subscription,
      source: EventNoun.Subscription,
      payload: {
        id: subscription.id,
        object: EventNoun.Subscription,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      organizationId: subscription.organizationId,
      livemode: subscription.livemode,
    },
    transaction
  )
}

export const commitSubscriptionCanceledEvent = async (
  subscription: Subscription.Record,
  transaction: DbTransaction
) => {
  const customer = await selectCustomerById(
    subscription.customerId,
    transaction
  )

  if (!customer) {
    throw new Error(
      `Customer not found for subscription ${subscription.id}`
    )
  }

  return commitEvent(
    {
      type: FlowgladEventType.SubscriptionCanceled,
      eventCategory: EventCategory.Subscription,
      source: EventNoun.Subscription,
      payload: {
        id: subscription.id,
        object: EventNoun.Subscription,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      organizationId: subscription.organizationId,
      livemode: subscription.livemode,
    },
    transaction
  )
}
