import type { CacheDependencyKey } from '@/utils/cache'
import { invalidateDependencies } from '@/utils/cache'
import { processLedgerCommand } from './ledgerManager/ledgerManager'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'
import type { Event } from './schema/events'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'
import type { TransactionOutput } from './transactionEnhacementTypes'
import type { DbTransaction, TransactionEffects } from './types'

/**
 * Creates a fresh effects accumulator and the callback functions that push to it.
 */
export function createEffectsAccumulator() {
  const effects: TransactionEffects = {
    cacheInvalidations: [],
    eventsToInsert: [],
    ledgerCommands: [],
  }

  const invalidateCache = (...keys: CacheDependencyKey[]) => {
    effects.cacheInvalidations.push(...keys)
  }
  const emitEvent = (...events: Event.Insert[]) => {
    effects.eventsToInsert.push(...events)
  }
  const enqueueLedgerCommand = (...commands: LedgerCommand[]) => {
    effects.ledgerCommands.push(...commands)
  }

  return {
    effects,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
  }
}

/**
 * Result of coalescing effects from both the accumulator and the transaction output.
 */
export interface CoalescedEffects {
  allEvents: Event.Insert[]
  allLedgerCommands: LedgerCommand[]
  cacheInvalidations: CacheDependencyKey[]
}

/**
 * Coalesces effects from the accumulator and the transaction output.
 */
export function coalesceEffects<T>(
  effects: TransactionEffects,
  output: TransactionOutput<T>
): CoalescedEffects {
  // Merge effects with output - effects accumulator takes precedence for arrays
  const allEvents = [
    ...effects.eventsToInsert,
    ...(output.eventsToInsert ?? []),
  ]
  const allLedgerCommands = [
    ...effects.ledgerCommands,
    ...(output.ledgerCommands ?? []),
  ]
  const cacheInvalidations = [
    ...effects.cacheInvalidations,
    ...(output.cacheInvalidations ?? []),
  ]

  return { allEvents, allLedgerCommands, cacheInvalidations }
}

/**
 * Processes the coalesced events and ledger commands within a transaction.
 * Returns the counts for observability.
 */
export async function processEffectsInTransaction(
  coalesced: CoalescedEffects,
  transaction: DbTransaction
): Promise<{ eventsCount: number; ledgerCommandsCount: number }> {
  const { allEvents, allLedgerCommands } = coalesced

  // Process events if any
  if (allEvents.length > 0) {
    await bulkInsertOrDoNothingEventsByHash(allEvents, transaction)
  }

  // Process ledger commands if any
  for (const command of allLedgerCommands) {
    await processLedgerCommand(command, transaction)
  }

  return {
    eventsCount: allEvents.length,
    ledgerCommandsCount: allLedgerCommands.length,
  }
}

/**
 * Invalidates cache dependencies after the transaction commits.
 * Deduplicates keys and fires-and-forgets (errors logged but don't fail the request).
 */
export function invalidateCacheAfterCommit(
  cacheInvalidations: CacheDependencyKey[]
) {
  if (cacheInvalidations.length > 0) {
    const uniqueInvalidations = [...new Set(cacheInvalidations)]
    void invalidateDependencies(uniqueInvalidations)
  }
}
