import { SpanKind } from '@opentelemetry/api'
import { sql } from 'drizzle-orm'
import type {
  AdminTransactionParams,
  TransactionEffects,
} from '@/db/types'
import {
  type CacheDependencyKey,
  invalidateDependencies,
} from '@/utils/cache'
import { isNil } from '@/utils/core'
import { traced } from '@/utils/tracing'
import db from './client'
import { processLedgerCommand } from './ledgerManager/ledgerManager'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'
import type { Event } from './schema/events'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'
import type { TransactionOutput } from './transactionEnhacementTypes'

interface AdminTransactionOptions {
  livemode?: boolean
}
// This method needs to be in its own module, because
// comingling it with `authenticatedTransaction` in the same file
// can cause issues where we execute stackAuth code globally that
// only works in the context of a nextjs sessionful runtime.

/**
 * Executes a function within an admin database transaction.
 * Delegates to comprehensiveAdminTransaction by wrapping the result.
 */
export async function adminTransaction<T>(
  fn: (params: AdminTransactionParams) => Promise<T>,
  options: AdminTransactionOptions = {}
): Promise<T> {
  return comprehensiveAdminTransaction(async (params) => {
    const result = await fn(params)
    return { result }
  }, options)
}

/**
 * Core comprehensive admin transaction logic without tracing.
 * Returns the full TransactionOutput plus processed counts so the traced wrapper can extract accurate metrics.
 */
const executeComprehensiveAdminTransaction = async <T>(
  fn: (
    params: AdminTransactionParams
  ) => Promise<TransactionOutput<T>>,
  effectiveLivemode: boolean
): Promise<{
  output: TransactionOutput<T>
  processedEventsCount: number
  processedLedgerCommandsCount: number
}> => {
  // Create effects accumulator - shared across all nested function calls
  const effects: TransactionEffects = {
    cacheInvalidations: [],
    eventsToInsert: [],
    ledgerCommands: [],
  }

  // Helper functions that push to the effects arrays
  const invalidateCache = (...keys: CacheDependencyKey[]) => {
    effects.cacheInvalidations.push(...keys)
  }
  const emitEvent = (...events: Event.Insert[]) => {
    effects.eventsToInsert.push(...events)
  }
  const enqueueLedgerCommand = (...commands: LedgerCommand[]) => {
    effects.ledgerCommands.push(...commands)
  }

  // Collect cache invalidations to process after commit (from both effects and output)
  let cacheInvalidations: CacheDependencyKey[] = []

  // Track processed counts for observability
  let processedEventsCount = 0
  let processedLedgerCommandsCount = 0

  const output = await db.transaction(async (transaction) => {
    // Set up transaction context (e.g., clearing previous JWT claims)
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )
    // Admin transactions typically run with higher privileges, no specific role needs to be set via JWT claims normally.

    const paramsForFn: AdminTransactionParams = {
      transaction,
      userId: 'ADMIN',
      livemode: effectiveLivemode,
      effects,
      invalidateCache,
      emitEvent,
      enqueueLedgerCommand,
    }

    const output = await fn(paramsForFn)

    // Validate that only one of ledgerCommand or ledgerCommands is provided in output
    if (
      output.ledgerCommand &&
      output.ledgerCommands &&
      output.ledgerCommands.length > 0
    ) {
      throw new Error(
        'Cannot provide both ledgerCommand and ledgerCommands. Please provide only one.'
      )
    }

    // Merge effects with output - effects accumulator takes precedence for arrays
    const allEvents = [
      ...effects.eventsToInsert,
      ...(output.eventsToInsert ?? []),
    ]
    const allLedgerCommands = [
      ...effects.ledgerCommands,
      ...(output.ledgerCommand ? [output.ledgerCommand] : []),
      ...(output.ledgerCommands ?? []),
    ]

    // Record counts for observability (before processing)
    processedEventsCount = allEvents.length
    processedLedgerCommandsCount = allLedgerCommands.length

    // Process events if any
    if (allEvents.length > 0) {
      await bulkInsertOrDoNothingEventsByHash(allEvents, transaction)
    }

    // Process ledger commands if any
    for (const command of allLedgerCommands) {
      await processLedgerCommand(command, transaction)
    }

    // Collect cache invalidations from both sources (don't process yet - wait for commit)
    cacheInvalidations = [
      ...effects.cacheInvalidations,
      ...(output.cacheInvalidations ?? []),
    ]

    // Return the full output so tracing can extract metrics
    return output
  })

  // Transaction committed successfully - now invalidate caches
  // Fire-and-forget; errors are logged but don't fail the request
  if (cacheInvalidations.length > 0) {
    // Deduplicate cache invalidation keys to reduce unnecessary Redis operations
    const uniqueInvalidations = [...new Set(cacheInvalidations)]
    void invalidateDependencies(uniqueInvalidations)
  }

  return {
    output,
    processedEventsCount,
    processedLedgerCommandsCount,
  }
}

/**
 * Executes a function within an admin database transaction and automatically processes
 * events and ledger commands from the transaction output.
 *
 * @param fn - Function that receives admin transaction parameters and returns a TransactionOutput
 *   containing the result, optional events to insert, and optional ledger commands to process
 * @param options - Transaction options including livemode flag
 * @returns Promise resolving to the result value from the transaction function
 *
 * @example
 * ```ts
 * const result = await comprehensiveAdminTransaction(async (params) => {
 *   // ... perform operations ...
 *   return {
 *     result: someValue,
 *     eventsToInsert: [event1, event2],
 *     ledgerCommand: { type: 'credit', amount: 100 }
 *   }
 * })
 * ```
 */
export async function comprehensiveAdminTransaction<T>(
  fn: (
    params: AdminTransactionParams
  ) => Promise<TransactionOutput<T>>,
  options: AdminTransactionOptions = {}
): Promise<T> {
  const { livemode = true } = options
  const effectiveLivemode = isNil(livemode) ? true : livemode

  const {
    output,
    processedEventsCount,
    processedLedgerCommandsCount,
  } = await traced(
    {
      options: {
        spanName: 'db.comprehensiveAdminTransaction',
        tracerName: 'db.transaction',
        kind: SpanKind.CLIENT,
        attributes: {
          'db.transaction.type': 'admin',
          'db.user_id': 'ADMIN',
          'db.livemode': effectiveLivemode,
        },
      },
      extractResultAttributes: (data) => ({
        // Use the actual processed counts, which include both effects callbacks and output
        'db.events_count': data.processedEventsCount,
        'db.ledger_commands_count': data.processedLedgerCommandsCount,
      }),
    },
    () => executeComprehensiveAdminTransaction(fn, effectiveLivemode)
  )()

  return output.result
}

/**
 * Wrapper around comprehensiveAdminTransaction for functions that return
 * a tuple of [result, events]. Adapts the old signature to TransactionOutput.
 */
export async function eventfulAdminTransaction<T>(
  fn: (
    params: AdminTransactionParams
  ) => Promise<[T, Event.Insert[]]>,
  options: AdminTransactionOptions = {}
): Promise<T> {
  return comprehensiveAdminTransaction(async (params) => {
    const [result, eventInserts] = await fn(params)
    return {
      result,
      eventsToInsert: eventInserts,
    }
  }, options)
}
