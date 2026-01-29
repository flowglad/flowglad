import { EventNoun } from '@db-core/enums'
import { inArray } from 'drizzle-orm'
import { customers } from '@/db/schema/customers'
import {
  type Event,
  events,
  eventsInsertSchema,
  eventsSelectSchema,
  eventsUpdateSchema,
} from '@/db/schema/events'
import { payments } from '@/db/schema/payments'
import { purchases } from '@/db/schema/purchases'
import { subscriptions } from '@/db/schema/subscriptions'
import {
  createBulkInsertOrDoNothingFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '../types'

const config: ORMMethodCreatorConfig<
  typeof events,
  typeof eventsSelectSchema,
  typeof eventsInsertSchema,
  typeof eventsUpdateSchema
> = {
  selectSchema: eventsSelectSchema,
  insertSchema: eventsInsertSchema,
  updateSchema: eventsUpdateSchema,
  tableName: 'events',
}

export const selectEventById = createSelectById(events, config)

export const insertEvent = createInsertFunction(events, config)

export const updateEvent = createUpdateFunction(events, config)

export const selectEvents = createSelectFunction(events, config)

export const upsertEventByHash = createUpsertFunction(
  events,
  [events.hash],
  config
)

const baseBulkInsertOrDoNothingEvents =
  createBulkInsertOrDoNothingFunction(events, config)

/**
 * Batch fetch pricingModelIds for multiple event payloads.
 * Groups objects by EventNoun type and fetches pricingModelIds efficiently.
 * Returns a Map from payload.id to pricingModelId.
 */
export const pricingModelIdsForEventPayloads = async (
  payloads: Array<{ id: string; object: EventNoun }>,
  transaction: DbTransaction
): Promise<Map<string, string>> => {
  if (payloads.length === 0) {
    return new Map()
  }

  // Group payloads by object type
  const customerIds: string[] = []
  const subscriptionIds: string[] = []
  const paymentIds: string[] = []
  const purchaseIds: string[] = []

  for (const payload of payloads) {
    switch (payload.object) {
      case EventNoun.Customer:
        customerIds.push(payload.id)
        break
      case EventNoun.Subscription:
        subscriptionIds.push(payload.id)
        break
      case EventNoun.Payment:
        paymentIds.push(payload.id)
        break
      case EventNoun.Purchase:
        purchaseIds.push(payload.id)
        break
    }
  }

  const pricingModelIdMap = new Map<string, string>()

  // Batch query each table
  if (customerIds.length > 0) {
    const customerResults = await transaction
      .select({
        id: customers.id,
        pricingModelId: customers.pricingModelId,
      })
      .from(customers)
      .where(inArray(customers.id, customerIds))
    for (const row of customerResults) {
      pricingModelIdMap.set(row.id, row.pricingModelId)
    }
  }

  if (subscriptionIds.length > 0) {
    const subscriptionResults = await transaction
      .select({
        id: subscriptions.id,
        pricingModelId: subscriptions.pricingModelId,
      })
      .from(subscriptions)
      .where(inArray(subscriptions.id, subscriptionIds))
    for (const row of subscriptionResults) {
      pricingModelIdMap.set(row.id, row.pricingModelId)
    }
  }

  if (paymentIds.length > 0) {
    const paymentResults = await transaction
      .select({
        id: payments.id,
        pricingModelId: payments.pricingModelId,
      })
      .from(payments)
      .where(inArray(payments.id, paymentIds))
    for (const row of paymentResults) {
      pricingModelIdMap.set(row.id, row.pricingModelId)
    }
  }

  if (purchaseIds.length > 0) {
    const purchaseResults = await transaction
      .select({
        id: purchases.id,
        pricingModelId: purchases.pricingModelId,
      })
      .from(purchases)
      .where(inArray(purchases.id, purchaseIds))
    for (const row of purchaseResults) {
      pricingModelIdMap.set(row.id, row.pricingModelId)
    }
  }

  return pricingModelIdMap
}

/**
 * Derives pricingModelId from a single event payload.
 * Used when inserting individual events.
 */
export const derivePricingModelIdFromEventPayload = async (
  payload: { id: string; object: EventNoun },
  transaction: DbTransaction
): Promise<string> => {
  const pricingModelIdMap = await pricingModelIdsForEventPayloads(
    [payload],
    transaction
  )
  const pricingModelId = pricingModelIdMap.get(payload.id)
  if (!pricingModelId) {
    throw new Error(
      `Pricing model id not found for event payload ${payload.id} (object type: ${payload.object})`
    )
  }
  return pricingModelId
}

/**
 * Bulk insert events with automatic pricingModelId derivation.
 * Events that already have pricingModelId set will use that value.
 * Events without pricingModelId will have it derived in batch from the payload object.
 */
export async function bulkInsertOrDoNothingEventsByHash(
  eventInserts: Event.Insert[],
  transaction: DbTransaction
): Promise<Event.Record[]> {
  // Separate events that need derivation from those that already have pricingModelId
  const needsDerivation = eventInserts.filter(
    (e) => !e.pricingModelId
  )

  // Batch fetch pricingModelIds for events that need it
  const pricingModelIdMap = await pricingModelIdsForEventPayloads(
    needsDerivation.map((e) => ({
      id: e.payload.id,
      object: e.payload.object,
    })),
    transaction
  )

  // Merge pricingModelIds into event inserts
  const eventsWithPricingModelId = eventInserts.map(
    (eventInsert): Event.Insert => {
      const pricingModelId =
        eventInsert.pricingModelId ??
        pricingModelIdMap.get(eventInsert.payload.id)
      if (!pricingModelId) {
        throw new Error(
          `Pricing model id not found for event payload ${eventInsert.payload.id}`
        )
      }
      return {
        ...eventInsert,
        pricingModelId,
      }
    }
  )

  return baseBulkInsertOrDoNothingEvents(
    eventsWithPricingModelId,
    [events.hash],
    transaction
  )
}
