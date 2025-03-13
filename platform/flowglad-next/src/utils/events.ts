import {
  EventNoun,
  EventCategory,
  EventRetentionPolicy,
  FlowgladEventType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { upsertEventByHash } from '@/db/tableMethods/eventMethods'
import core from './core'
import { Event } from '@/db/schema/events'
import { Payment } from '@/db/schema/payments'
import { CustomerProfile } from '@/db/schema/customerProfiles'

export interface CreateEventPayload {
  type: FlowgladEventType
  eventCategory: EventCategory
  source: EventNoun
  payload: Event.Record['rawPayload']
  organizationId: string
  livemode: boolean
}

const eventTypeToRetentionPolicy: Record<
  FlowgladEventType,
  EventRetentionPolicy
> = {
  [FlowgladEventType.SchedulerEventCreated]:
    EventRetentionPolicy.Short,
  [FlowgladEventType.CustomerProfileCreated]:
    EventRetentionPolicy.Short,
  [FlowgladEventType.CustomerProfileUpdated]:
    EventRetentionPolicy.Short,
  [FlowgladEventType.OpenPurchaseCreated]: EventRetentionPolicy.Short,
  [FlowgladEventType.PurchaseCompleted]: EventRetentionPolicy.Short,
  [FlowgladEventType.PaymentFailed]: EventRetentionPolicy.Short,
  [FlowgladEventType.FormSubmissionCreated]:
    EventRetentionPolicy.Short,
  [FlowgladEventType.PaymentSucceeded]:
    EventRetentionPolicy.Permanent,
  [FlowgladEventType.SubscriptionCreated]:
    EventRetentionPolicy.Permanent,
  [FlowgladEventType.SubscriptionUpdated]:
    EventRetentionPolicy.Permanent,
  [FlowgladEventType.SubscriptionCancelled]:
    EventRetentionPolicy.Permanent,
}

export const commitEvent = async (
  payload: CreateEventPayload,
  transaction: DbTransaction
) => {
  return upsertEventByHash(
    {
      type: payload.type,
      submittedAt: new Date(),
      eventCategory: payload.eventCategory,
      eventRetentionPolicy: eventTypeToRetentionPolicy[payload.type],
      occurredAt: new Date(),
      rawPayload: payload.payload,
      hash: core.hashData(JSON.stringify(payload.payload)),
      metadata: {},
      source: payload.source,
      subjectEntity: null,
      subjectId: null,
      objectEntity: null,
      objectId: null,
      processedAt: null,
      organizationId: payload.organizationId,
      livemode: payload.livemode,
    },
    transaction
  )
}

const generateEventPayload = (input: {}) => {
  return JSON.parse(JSON.stringify(input))
}

/**
 * TODO: restore this, but with native subscription implementation
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
  return commitEvent(
    {
      type: FlowgladEventType.PaymentSucceeded,
      eventCategory: EventCategory.Financial,
      source: EventNoun.Payment,
      payload: generateEventPayload(payment),
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
  return commitEvent(
    {
      type: FlowgladEventType.PaymentFailed,
      eventCategory: EventCategory.Financial,
      source: EventNoun.Payment,
      payload: generateEventPayload(payment),
      organizationId: payment.organizationId,
      livemode: payment.livemode,
    },
    transaction
  )
}

export const commitCustomerProfileCreatedEvent = async (
  customerProfile: CustomerProfile.Record,
  transaction: DbTransaction
) => {
  return commitEvent(
    {
      type: FlowgladEventType.CustomerProfileCreated,
      eventCategory: EventCategory.Customer,
      source: EventNoun.CustomerProfile,
      payload: generateEventPayload(customerProfile),
      organizationId: customerProfile.organizationId,
      livemode: customerProfile.livemode,
    },
    transaction
  )
}
