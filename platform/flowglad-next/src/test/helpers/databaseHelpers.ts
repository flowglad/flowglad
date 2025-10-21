/**
 * Common database test helper functions used across tests
 * This avoids re-implementing the same database query functions in multiple test files
 */

import { DbTransaction } from '@/db/types'
import { selectEvents } from '@/db/tableMethods/eventMethods'

// Helper function to query events by customer
export async function selectEventsByCustomer(
  customerId: string,
  organizationId: string,
  transaction: DbTransaction
) {
  const allEvents = await selectEvents({ organizationId }, transaction)
  
  // Filter events for this specific customer by checking the payload
  return allEvents.filter(event => 
    event.payload.customer?.id === customerId
  )
}
