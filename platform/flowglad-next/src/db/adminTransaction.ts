import { SpanKind } from '@opentelemetry/api'
import { sql } from 'drizzle-orm'
import type { AdminTransactionParams } from '@/db/types'
import {
  type CacheDependencyKey,
  invalidateDependencies,
} from '@/utils/cache'
import { isNil } from '@/utils/core'
import { traced } from '@/utils/tracing'
import db from './client'
import { processLedgerCommand } from './ledgerManager/ledgerManager'
import type { Event } from './schema/events'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'
// New imports for ledger and transaction output types
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
 * Returns the full TransactionOutput so the traced wrapper can extract metrics.
 */
const executeComprehensiveAdminTransaction = async <T>(
  fn: (
    params: AdminTransactionParams
  ) => Promise<TransactionOutput<T>>,
  effectiveLivemode: boolean
): Promise<TransactionOutput<T>> => {
  // Collect cache invalidations to process after commit
  let cacheInvalidations: CacheDependencyKey[] = []

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
    }

    const output = await fn(paramsForFn)

    // Validate that only one of ledgerCommand or ledgerCommands is provided
    if (
      output.ledgerCommand &&
      output.ledgerCommands &&
      output.ledgerCommands.length > 0
    ) {
      throw new Error(
        'Cannot provide both ledgerCommand and ledgerCommands. Please provide only one.'
      )
    }

    // Process events if any
    if (output.eventsToInsert && output.eventsToInsert.length > 0) {
      await bulkInsertOrDoNothingEventsByHash(
        output.eventsToInsert,
        transaction
      )
    }

    // Process ledger commands if any
    if (output.ledgerCommand) {
      await processLedgerCommand(output.ledgerCommand, transaction)
    } else if (
      output.ledgerCommands &&
      output.ledgerCommands.length > 0
    ) {
      for (const command of output.ledgerCommands) {
        await processLedgerCommand(command, transaction)
      }
    }

    // Collect cache invalidations (don't process yet - wait for commit)
    if (
      output.cacheInvalidations &&
      output.cacheInvalidations.length > 0
    ) {
      cacheInvalidations = output.cacheInvalidations
    }

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

  return output
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

  const output = await traced(
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
      extractResultAttributes: (output: TransactionOutput<T>) => ({
        'db.events_count': output.eventsToInsert?.length ?? 0,
        'db.ledger_commands_count': output.ledgerCommand
          ? 1
          : (output.ledgerCommands?.length ?? 0),
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
