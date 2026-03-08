import type { Event } from '@db-core/schema/events'
import type { CacheDependencyKey } from '@/utils/cache'
import { invalidateDependencies } from '@/utils/cache.internal'
import { processLedgerCommand } from './ledgerManager/ledgerManager'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'
import type {
  DbTransaction,
  EnqueueTriggerTaskCallback,
  QueuedTriggerTask,
  TransactionEffects,
  TriggerTaskHandle,
} from './types'

/**
 * Creates a fresh effects accumulator and the callback functions that push to it.
 */
export function createEffectsAccumulator() {
  const effects: TransactionEffects = {
    cacheInvalidations: [],
    eventsToInsert: [],
    ledgerCommands: [],
    triggerTasks: [],
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

/**
 * Dispatches queued trigger tasks after the transaction commits.
 * Fire-and-forget: errors are logged but don't fail the request.
 * Returns a map of user-provided keys to trigger handles.
 */
export async function dispatchTriggerTasksAfterCommit(
  triggerTasks: QueuedTriggerTask[]
): Promise<Map<string, TriggerTaskHandle>> {
  const handles = new Map<string, TriggerTaskHandle>()
  if (triggerTasks.length === 0) {
    return handles
  }
  const results = await Promise.allSettled(
    triggerTasks.map(async (queued) => {
      const result = await queued.task.trigger(
        queued.payload,
        queued.options
      )
      return { key: queued.key, id: result.id }
    })
  )
  for (const result of results) {
    if (result.status === 'fulfilled') {
      handles.set(result.value.key, { id: result.value.id })
    } else {
      console.error(
        'Failed to dispatch trigger task after commit:',
        result.reason
      )
    }
  }
  return handles
}
