import type {
  CacheDependencyKey,
  CacheRecomputationContext,
} from '@/utils/cache'
import { invalidateDependencies } from '@/utils/cache.internal'
import { processLedgerCommand } from './ledgerManager/ledgerManager'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'
import type { Event } from './schema/events'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'
import type {
  DbTransaction,
  TransactionEffects,
  TransactionEffectsContext,
} from './types'

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
 * Processes the accumulated events and ledger commands within a transaction.
 * Returns the counts for observability.
 */
export async function processEffectsInTransaction(
  effects: TransactionEffects,
  transaction: DbTransaction
): Promise<{ eventsCount: number; ledgerCommandsCount: number }> {
  const { eventsToInsert, ledgerCommands } = effects

  // Process events if any
  if (eventsToInsert.length > 0) {
    await bulkInsertOrDoNothingEventsByHash(
      eventsToInsert,
      transaction
    )
  }

  // Process ledger commands if any
  for (const command of ledgerCommands) {
    await processLedgerCommand(command, transaction)
  }

  return {
    eventsCount: eventsToInsert.length,
    ledgerCommandsCount: ledgerCommands.length,
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

/**
 * Creates a no-op TransactionEffectsContext for use in seeds and tests.
 * Cache invalidation, event emission, and ledger commands are silently ignored.
 *
 * **WARNING**: Only use this for seeds, tests, and other contexts where:
 * 1. Cache invalidation is not needed (fresh database, tests that clear cache)
 * 2. Events don't need to be emitted
 * 3. Ledger commands don't need to be processed
 *
 * For production code, always use the proper transaction context from
 * authenticatedTransaction or adminTransaction.
 *
 * @param transaction - The database transaction
 * @param options - Optional configuration
 * @param options.livemode - Whether this is livemode (default: false for seeds/tests)
 * @returns A TransactionEffectsContext with no-op callbacks
 *
 * @example
 * ```typescript
 * // In seed scripts or tests
 * const ctx = noopTransactionContext(transaction)
 * await insertProduct(product, ctx)
 * ```
 */
export function noopTransactionContext(
  transaction: DbTransaction,
  options: { livemode?: boolean } = {}
): TransactionEffectsContext {
  const { livemode = false } = options

  // No-op callbacks that silently ignore all effects
  const noopInvalidateCache = () => {}
  const noopEmitEvent = () => {}
  const noopEnqueueLedgerCommand = () => {}

  // Admin context for seeds/tests (no user context)
  const cacheRecomputationContext: CacheRecomputationContext = {
    type: 'admin',
    livemode,
  }

  return {
    transaction,
    cacheRecomputationContext,
    invalidateCache: noopInvalidateCache,
    emitEvent: noopEmitEvent,
    enqueueLedgerCommand: noopEnqueueLedgerCommand,
  }
}
