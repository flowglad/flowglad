import type { Event } from '@db-core/schema/events'
import type { CacheDependencyKey } from '@/utils/cache'
import { invalidateDependencies } from '@/utils/cache.internal'
import {
  type AnyDependency,
  type CacheDependency,
  isSyncDependency,
  type SyncEmissionContext,
} from '@/utils/dependency'
import { processLedgerCommand } from './ledgerManager/ledgerManager'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'
import type {
  DbTransaction,
  EnqueueTriggerTaskCallback,
  QueuedTriggerTask,
  TransactionEffects,
} from './types'

/**
 * Overloaded invalidateCache function type.
 *
 * Overload 1: Cache-only dependencies - no context required
 * Overload 2: Any dependencies with context - required when any sync-enabled dependency is present
 *
 * The compile-time enforcement works because:
 * - CacheDependency has { syncEnabled: false }
 * - SyncDependency has { syncEnabled: true }
 * - TypeScript will pick the first matching overload
 * - If you pass a SyncDependency without context, it won't match overload 1 (type mismatch)
 *   and overload 2 requires context as the first argument
 */
interface InvalidateCacheFunction {
  /**
   * Invalidate cache-only dependencies. No sync events will be emitted.
   */
  (...deps: CacheDependency[]): void

  /**
   * Invalidate any dependencies with context. Sync-enabled dependencies will
   * be queued for sync event emission after commit.
   */
  (context: SyncEmissionContext, ...deps: AnyDependency[]): void

  /**
   * Invalidate using legacy string-based cache keys.
   * @deprecated Use structured dependencies instead
   */
  (...keys: CacheDependencyKey[]): void
}

/**
 * Creates a fresh effects accumulator and the callback functions that push to it.
 */
export function createEffectsAccumulator() {
  const effects: TransactionEffects = {
    invalidations: [],
    cacheInvalidations: [],
    eventsToInsert: [],
    ledgerCommands: [],
    triggerTasks: [],
  }

  /**
   * Overloaded invalidateCache implementation.
   * Handles three cases:
   * 1. Cache-only dependencies (no context)
   * 2. Any dependencies with context (sync-enabled deps trigger sync)
   * 3. Legacy string-based cache keys
   */
  const invalidateCache: InvalidateCacheFunction = (
    contextOrDepOrKey:
      | SyncEmissionContext
      | AnyDependency
      | CacheDependencyKey,
    ...rest: (AnyDependency | CacheDependencyKey)[]
  ): void => {
    // Check if first argument is a SyncEmissionContext (has organizationId)
    const hasContext =
      typeof contextOrDepOrKey === 'object' &&
      contextOrDepOrKey !== null &&
      'organizationId' in contextOrDepOrKey &&
      !('type' in contextOrDepOrKey)

    if (hasContext) {
      // Context-based path: first arg is context, rest are dependencies
      const context = contextOrDepOrKey as SyncEmissionContext
      for (const dep of rest as AnyDependency[]) {
        if (isSyncDependency(dep)) {
          effects.invalidations.push({ dependency: dep, context })
        } else {
          effects.invalidations.push({ dependency: dep })
        }
      }
    } else if (
      typeof contextOrDepOrKey === 'object' &&
      contextOrDepOrKey !== null &&
      'type' in contextOrDepOrKey
    ) {
      // Structured dependency path (no context) - must be cache-only deps
      const firstDep = contextOrDepOrKey as CacheDependency
      effects.invalidations.push({ dependency: firstDep })
      for (const dep of rest as CacheDependency[]) {
        effects.invalidations.push({ dependency: dep })
      }
    } else {
      // Legacy string-based cache key path
      effects.cacheInvalidations.push(
        contextOrDepOrKey as CacheDependencyKey
      )
      for (const key of rest as CacheDependencyKey[]) {
        effects.cacheInvalidations.push(key)
      }
    }
  }

  const emitEvent = (...events: Event.Insert[]) => {
    effects.eventsToInsert.push(...events)
  }
  const enqueueLedgerCommand = (...commands: LedgerCommand[]) => {
    effects.ledgerCommands.push(...commands)
  }
  const enqueueTriggerTask: EnqueueTriggerTaskCallback = (
    key,
    task,
    payload,
    options
  ) => {
    effects.triggerTasks.push({
      key,
      task,
      payload,
      options,
    } as QueuedTriggerTask)
  }

  return {
    effects,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
    enqueueTriggerTask,
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
