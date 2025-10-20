/**
 * Common database test helper functions used across tests
 * This avoids re-implementing the same database query functions in multiple test files
 */

import { FlowgladEventType } from '@/types'
import { DbTransaction } from '@/db/types'

// Helper function to query events by customer
export async function selectEventsByCustomer(
  customerId: string,
  organizationId: string,
  transaction: DbTransaction
) {
  const { selectEvents } = await import('@/db/tableMethods/eventMethods')
  const allEvents = await selectEvents({ organizationId }, transaction)
  
  // Filter events for this specific customer by checking the payload
  return allEvents.filter(event => 
    event.payload.customer?.id === customerId
  )
}

// Helper function to find events by type
export async function selectEventsByType(
  eventType: FlowgladEventType,
  organizationId: string,
  transaction: DbTransaction
) {
  const { selectEvents } = await import('@/db/tableMethods/eventMethods')
  const allEvents = await selectEvents({ organizationId }, transaction)
  
  return allEvents.filter(event => event.type === eventType)
}

// Helper function to find a single event by type
export async function findEventByType(
  eventType: FlowgladEventType,
  organizationId: string,
  transaction: DbTransaction
) {
  const events = await selectEventsByType(eventType, organizationId, transaction)
  return events[0] // Return the first match, or undefined if none found
}
