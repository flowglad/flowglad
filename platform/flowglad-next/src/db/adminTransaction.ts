import { SpanKind } from '@opentelemetry/api'
import { Result } from 'better-result'
import { sql } from 'drizzle-orm'
import type {
  AdminTransactionParams,
  CacheRecomputationContext,
  TransactionEffectsContext,
} from '@/db/types'
import { isNil } from '@/utils/core'
import { traced } from '@/utils/tracing'
import db from './client'
import {
  createEffectsAccumulator,
  invalidateCacheAfterCommit,
  processEffectsInTransaction,
} from './transactionEffectsHelpers'

interface AdminTransactionOptions {
  livemode?: boolean
}
// This method needs to be in its own module, because
// comingling it with `authenticatedTransaction` in the same file
// can cause issues where we execute stackAuth code globally that
// only works in the context of a nextjs sessionful runtime.

/**
 * Core comprehensive admin transaction logic without tracing.
 * Returns the full Result plus processed counts so the traced wrapper can extract accurate metrics.
 *
 * Note: This is a function declaration (not const arrow function) to ensure hoisting.
 * This prevents TDZ errors when there are circular import dependencies.
 */
async function executeComprehensiveAdminTransaction<T>(
  fn: (params: AdminTransactionParams) => Promise<Result<T, Error>>,
  effectiveLivemode: boolean
): Promise<{
  output: Result<T, Error>
  processedEventsCount: number
  processedLedgerCommandsCount: number
}> {
  // Create effects accumulator and callbacks
  const {
    effects,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
  } = createEffectsAccumulator()

  let processedEventsCount = 0
  let processedLedgerCommandsCount = 0

  const output = await db.transaction(async (transaction) => {
    // Set up transaction context (e.g., clearing previous JWT claims)
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )
    // Admin transactions typically run with higher privileges, no specific role needs to be set via JWT claims normally.

    const cacheRecomputationContext: CacheRecomputationContext = {
      livemode: effectiveLivemode,
    }
    const paramsForFn: AdminTransactionParams = {
      transaction,
      userId: 'ADMIN',
      livemode: effectiveLivemode,
      cacheRecomputationContext,
      effects,
      invalidateCache,
      emitEvent,
      enqueueLedgerCommand,
    }

    const output = await fn(paramsForFn)

    // Check for error early to skip effects and roll back transaction
    if (output.status === 'error') {
      throw output.error
    }

    // Process accumulated effects
    const counts = await processEffectsInTransaction(
      effects,
      transaction
    )
    processedEventsCount = counts.eventsCount
    processedLedgerCommandsCount = counts.ledgerCommandsCount

    // Return the full output so tracing can extract metrics
    return output
  })

  // Transaction committed successfully - now invalidate caches
  invalidateCacheAfterCommit(effects.cacheInvalidations)

  return {
    output,
    processedEventsCount,
    processedLedgerCommandsCount,
  }
}

/**
 * Convenience wrapper for adminTransaction that takes a Result-returning
 * function and automatically unwraps the result.
 *
 * Use this at boundaries (routers, API routes, SSR components) where throwing is acceptable.
 *
 * @param fn - Function that receives TransactionEffectsContext and returns a Result
 * @param options - Transaction options including livemode flag
 * @returns The unwrapped value, throwing on error
 *
 * @example
 * ```ts
 * const data = await adminTransactionUnwrap(
 *   async (ctx) => processData(ctx),
 *   { livemode: true }
 * )
 * ```
 */
export async function adminTransactionUnwrap<T>(
  fn: (ctx: TransactionEffectsContext) => Promise<Result<T, Error>>,
  options?: AdminTransactionOptions
): Promise<T> {
  const result = await adminTransaction(async (params) => {
    const ctx: TransactionEffectsContext = {
      transaction: params.transaction,
      cacheRecomputationContext: params.cacheRecomputationContext,
      invalidateCache: params.invalidateCache,
      emitEvent: params.emitEvent,
      enqueueLedgerCommand: params.enqueueLedgerCommand,
    }
    return fn(ctx)
  }, options)
  // Throw the original error directly to preserve TRPCError type
  // (using .unwrap() would wrap it in a Panic error)
  if (result.status === 'error') {
    throw result.error
  }
  return result.value
}

/**
 * Executes a function within an admin database transaction.
 * The callback receives full transaction parameters.
 *
 * The callback is responsible for returning a Result - this function passes through whatever
 * Result the callback returns.
 *
 * @param fn - Function that receives admin transaction parameters and returns a Result
 * @param options - Transaction options including livemode flag
 * @returns Promise resolving to the Result returned by the callback
 *
 * @example
 * ```ts
 * const result = await adminTransaction(async ({ transaction }) => {
 *   const customer = await selectCustomerById(customerId, transaction)
 *   if (!customer) {
 *     return Result.err(new NotFoundError('Customer', customerId))
 *   }
 *   return Result.ok(customer)
 * })
 * ```
 */
export async function adminTransaction<T>(
  fn: (params: AdminTransactionParams) => Promise<Result<T, Error>>,
  options: AdminTransactionOptions = {}
): Promise<Result<T, Error>> {
  const { livemode = true } = options
  const effectiveLivemode = isNil(livemode) ? true : livemode

  try {
    const { output } = await traced(
      {
        options: {
          spanName: 'db.adminTransaction',
          tracerName: 'db.transaction',
          kind: SpanKind.CLIENT,
          attributes: {
            'db.transaction.type': 'admin',
            'db.user_id': 'ADMIN',
            'db.livemode': effectiveLivemode,
          },
        },
        extractResultAttributes: (data) => ({
          'db.events_count': data.processedEventsCount,
          'db.ledger_commands_count':
            data.processedLedgerCommandsCount,
        }),
      },
      () =>
        executeComprehensiveAdminTransaction(fn, effectiveLivemode)
    )()

    return output
  } catch (error) {
    // Convert thrown errors back to Result.err
    // This happens when the callback returns Result.err, which triggers
    // a throw inside executeComprehensiveAdminTransaction to roll back the transaction
    return Result.err(
      error instanceof Error ? error : new Error(String(error))
    )
  }
}
