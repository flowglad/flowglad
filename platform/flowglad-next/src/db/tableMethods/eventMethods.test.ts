import { describe, expect, it } from 'bun:test'
import { adminTransaction } from '@/db/adminTransaction'
import { EventNoun, FlowgladEventType } from '@/types'
import core from '@/utils/core'
import { setupOrg } from '../../../seedDatabase'
import {
  bulkInsertOrDoNothingEventsByHash,
  insertEvent,
  selectEventById,
  selectEvents,
  updateEvent,
  upsertEventByHash,
} from './eventMethods'

describe('insertEvent', () => {
  it('creates a new event with required fields', async () => {
    const { organization } = await setupOrg()
    const eventHash = `hash_${core.nanoid()}`
    const now = Date.now()

    const event = await adminTransaction(async ({ transaction }) => {
      return insertEvent(
        {
          organizationId: organization.id,
          type: FlowgladEventType.CustomerCreated,
          payload: {
            id: `cust_${core.nanoid()}`,
            object: EventNoun.Customer,
          },
          occurredAt: now,
          submittedAt: now,
          metadata: {},
          hash: eventHash,
          livemode: false,
        },
        transaction
      )
    })

    expect(event.organizationId).toBe(organization.id)
    expect(event.type).toBe(FlowgladEventType.CustomerCreated)
    expect(event.hash).toBe(eventHash)
    expect(event.livemode).toBe(false)
  })

  it('creates an event with object entity', async () => {
    const { organization } = await setupOrg()
    const now = Date.now()

    const event = await adminTransaction(async ({ transaction }) => {
      return insertEvent(
        {
          organizationId: organization.id,
          type: FlowgladEventType.SubscriptionCreated,
          payload: {
            id: `sub_${core.nanoid()}`,
            object: EventNoun.Subscription,
          },
          occurredAt: now,
          submittedAt: now,
          metadata: { source: 'test' },
          hash: `hash_${core.nanoid()}`,
          livemode: false,
          objectEntity: EventNoun.Subscription,
        },
        transaction
      )
    })

    expect(event.objectEntity).toBe(EventNoun.Subscription)
    expect(event.type).toBe(FlowgladEventType.SubscriptionCreated)
  })
})

describe('selectEventById', () => {
  it('returns event record when id exists', async () => {
    const { organization } = await setupOrg()
    const eventHash = `hash_${core.nanoid()}`
    const now = Date.now()

    const createdEvent = await adminTransaction(async ({ transaction }) => {
      return insertEvent(
        {
          organizationId: organization.id,
          type: FlowgladEventType.PaymentSucceeded,
          payload: {
            id: `pay_${core.nanoid()}`,
            object: EventNoun.Payment,
          },
          occurredAt: now,
          submittedAt: now,
          metadata: {},
          hash: eventHash,
          livemode: false,
        },
        transaction
      )
    })

    const selectedEvent = await adminTransaction(async ({ transaction }) => {
      return selectEventById(createdEvent.id, transaction)
    })

    expect(selectedEvent.id).toBe(createdEvent.id)
    expect(selectedEvent.hash).toBe(eventHash)
    expect(selectedEvent.type).toBe(FlowgladEventType.PaymentSucceeded)
  })
})

describe('selectEvents', () => {
  it('returns events matching organizationId condition', async () => {
    const { organization } = await setupOrg()
    const uniqueHash = `unique_hash_${core.nanoid()}`
    const now = Date.now()

    await adminTransaction(async ({ transaction }) => {
      return insertEvent(
        {
          organizationId: organization.id,
          type: FlowgladEventType.CustomerUpdated,
          payload: {
            id: `cust_${core.nanoid()}`,
            object: EventNoun.Customer,
          },
          occurredAt: now,
          submittedAt: now,
          metadata: {},
          hash: uniqueHash,
          livemode: false,
        },
        transaction
      )
    })

    const events = await adminTransaction(async ({ transaction }) => {
      return selectEvents({ organizationId: organization.id }, transaction)
    })

    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events.some((e) => e.hash === uniqueHash)).toBe(true)
  })

  it('returns empty array when no events match condition', async () => {
    const nonExistentOrgId = `org_${core.nanoid()}`

    const events = await adminTransaction(async ({ transaction }) => {
      return selectEvents({ organizationId: nonExistentOrgId }, transaction)
    })

    expect(events.length).toBe(0)
  })

  it('returns events matching type condition', async () => {
    const { organization } = await setupOrg()
    const now = Date.now()

    await adminTransaction(async ({ transaction }) => {
      return insertEvent(
        {
          organizationId: organization.id,
          type: FlowgladEventType.PurchaseCompleted,
          payload: {
            id: `pur_${core.nanoid()}`,
            object: EventNoun.Purchase,
          },
          occurredAt: now,
          submittedAt: now,
          metadata: {},
          hash: `hash_${core.nanoid()}`,
          livemode: false,
        },
        transaction
      )
    })

    const events = await adminTransaction(async ({ transaction }) => {
      return selectEvents(
        {
          organizationId: organization.id,
          type: FlowgladEventType.PurchaseCompleted,
        },
        transaction
      )
    })

    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(
      events.every((e) => e.type === FlowgladEventType.PurchaseCompleted)
    ).toBe(true)
  })
})

describe('updateEvent', () => {
  it('updates event processedAt field', async () => {
    const { organization } = await setupOrg()
    const now = Date.now()
    const processedAt = now + 1000

    const createdEvent = await adminTransaction(async ({ transaction }) => {
      return insertEvent(
        {
          organizationId: organization.id,
          type: FlowgladEventType.CustomerCreated,
          payload: {
            id: `cust_${core.nanoid()}`,
            object: EventNoun.Customer,
          },
          occurredAt: now,
          submittedAt: now,
          metadata: {},
          hash: `hash_${core.nanoid()}`,
          livemode: false,
        },
        transaction
      )
    })

    expect(createdEvent.processedAt).toBeNull()

    const updatedEvent = await adminTransaction(async ({ transaction }) => {
      return updateEvent(
        {
          id: createdEvent.id,
          processedAt,
        },
        transaction
      )
    })

    expect(updatedEvent.processedAt).toBe(processedAt)
    expect(updatedEvent.id).toBe(createdEvent.id)
  })
})

describe('upsertEventByHash', () => {
  // NOTE: createUpsertFunction uses onConflictDoNothing, NOT onConflictDoUpdate
  // This means it returns the inserted record if new, or an empty array if the record already exists

  it('inserts new event when hash does not exist', async () => {
    const { organization } = await setupOrg()
    const uniqueHash = `upsert_hash_${core.nanoid()}`
    const now = Date.now()

    const events = await adminTransaction(async ({ transaction }) => {
      return upsertEventByHash(
        {
          organizationId: organization.id,
          type: FlowgladEventType.CustomerCreated,
          payload: {
            id: `cust_${core.nanoid()}`,
            object: EventNoun.Customer,
          },
          occurredAt: now,
          submittedAt: now,
          metadata: {},
          hash: uniqueHash,
          livemode: false,
        },
        transaction
      )
    })

    expect(events.length).toBe(1)
    expect(events[0].hash).toBe(uniqueHash)
  })

  it('returns empty array when hash already exists (onConflictDoNothing behavior)', async () => {
    const { organization } = await setupOrg()
    const existingHash = `existing_hash_${core.nanoid()}`
    const now = Date.now()

    // First, insert the event
    await adminTransaction(async ({ transaction }) => {
      return insertEvent(
        {
          organizationId: organization.id,
          type: FlowgladEventType.CustomerCreated,
          payload: {
            id: `cust_${core.nanoid()}`,
            object: EventNoun.Customer,
          },
          occurredAt: now,
          submittedAt: now,
          metadata: {},
          hash: existingHash,
          livemode: false,
        },
        transaction
      )
    })

    // Try to upsert with the same hash - should return empty array
    const events = await adminTransaction(async ({ transaction }) => {
      return upsertEventByHash(
        {
          organizationId: organization.id,
          type: FlowgladEventType.CustomerUpdated,
          payload: {
            id: `cust_${core.nanoid()}`,
            object: EventNoun.Customer,
          },
          occurredAt: now + 1000,
          submittedAt: now + 1000,
          metadata: { updated: true },
          hash: existingHash,
          livemode: false,
        },
        transaction
      )
    })

    // onConflictDoNothing returns empty array when conflict occurs
    expect(events.length).toBe(0)
  })
})

describe('bulkInsertOrDoNothingEventsByHash', () => {
  it('inserts multiple new events', async () => {
    const { organization } = await setupOrg()
    const now = Date.now()

    const eventInserts = [
      {
        organizationId: organization.id,
        type: FlowgladEventType.CustomerCreated,
        payload: {
          id: `cust_${core.nanoid()}`,
          object: EventNoun.Customer as const,
        },
        occurredAt: now,
        submittedAt: now,
        metadata: {},
        hash: `bulk_hash_1_${core.nanoid()}`,
        livemode: false,
      },
      {
        organizationId: organization.id,
        type: FlowgladEventType.PaymentSucceeded,
        payload: {
          id: `pay_${core.nanoid()}`,
          object: EventNoun.Payment as const,
        },
        occurredAt: now,
        submittedAt: now,
        metadata: {},
        hash: `bulk_hash_2_${core.nanoid()}`,
        livemode: false,
      },
    ]

    const events = await adminTransaction(async ({ transaction }) => {
      return bulkInsertOrDoNothingEventsByHash(eventInserts, transaction)
    })

    expect(events.length).toBe(2)
  })

  it('skips events with existing hashes (onConflictDoNothing behavior)', async () => {
    const { organization } = await setupOrg()
    const existingHash = `existing_bulk_hash_${core.nanoid()}`
    const now = Date.now()

    // First, insert an event with a specific hash
    await adminTransaction(async ({ transaction }) => {
      return insertEvent(
        {
          organizationId: organization.id,
          type: FlowgladEventType.CustomerCreated,
          payload: {
            id: `cust_${core.nanoid()}`,
            object: EventNoun.Customer,
          },
          occurredAt: now,
          submittedAt: now,
          metadata: {},
          hash: existingHash,
          livemode: false,
        },
        transaction
      )
    })

    // Try to bulk insert with one existing and one new hash
    const eventInserts = [
      {
        organizationId: organization.id,
        type: FlowgladEventType.CustomerUpdated,
        payload: {
          id: `cust_${core.nanoid()}`,
          object: EventNoun.Customer as const,
        },
        occurredAt: now,
        submittedAt: now,
        metadata: {},
        hash: existingHash, // This one exists
        livemode: false,
      },
      {
        organizationId: organization.id,
        type: FlowgladEventType.PaymentSucceeded,
        payload: {
          id: `pay_${core.nanoid()}`,
          object: EventNoun.Payment as const,
        },
        occurredAt: now,
        submittedAt: now,
        metadata: {},
        hash: `new_bulk_hash_${core.nanoid()}`, // This one is new
        livemode: false,
      },
    ]

    const events = await adminTransaction(async ({ transaction }) => {
      return bulkInsertOrDoNothingEventsByHash(eventInserts, transaction)
    })

    // Only the new event should be inserted
    expect(events.length).toBe(1)
  })
})
