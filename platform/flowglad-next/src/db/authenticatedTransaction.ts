import { SpanKind } from '@opentelemetry/api'
import { Result } from 'better-result'
import type {
  CacheRecomputationContext,
  ComprehensiveAuthenticatedTransactionParams,
  TransactionEffectsContext,
} from '@/db/types'
import core from '@/utils/core'
import { traced } from '@/utils/tracing'
import db from './client'
import { getDatabaseAuthenticationInfo } from './databaseAuthentication'
import {
  createEffectsAccumulator,
  invalidateCacheAfterCommit,
  processEffectsInTransaction,
} from './transactionEffectsHelpers'
import { withRLS } from './withRLS'

interface AuthenticatedTransactionOptions {
  apiKey?: string
  /**
   * Only used in test environment to set the organization id for the transaction
   * Used in testing customer billing portal RLS functionality
   */
  __testOnlyOrganizationId?: string
  /**
   * Customer context for customer billing portal requests.
   */
  customerId?: string
}

/**
 * Executes a function within an authenticated database transaction.
 * Delegates to comprehensiveAuthenticatedTransaction by wrapping the result.
 */
export async function authenticatedTransaction<T>(
  fn: (
    params: ComprehensiveAuthenticatedTransactionParams
  ) => Promise<T>,
  options?: AuthenticatedTransactionOptions
): Promise<T> {
  return comprehensiveAuthenticatedTransaction(async (params) => {
    const result = await fn(params)
    return Result.ok(result)
  }, options)
}

/**
 * Core comprehensive authenticated transaction logic without tracing.
 * Returns the full Result plus auth info and processed counts so the traced wrapper can extract accurate metrics.
 */
const executeComprehensiveAuthenticatedTransaction = async <T>(
  fn: (
    params: ComprehensiveAuthenticatedTransactionParams
  ) => Promise<Result<T, Error>>,
  options?: AuthenticatedTransactionOptions
): Promise<{
  output: Result<T, Error>
  userId: string
  organizationId?: string
  livemode: boolean
  processedEventsCount: number
  processedLedgerCommandsCount: number
}> => {
  const { apiKey, __testOnlyOrganizationId, customerId } =
    options ?? {}
  if (!core.IS_TEST && __testOnlyOrganizationId) {
    throw new Error(
      'Attempted to use test organization id in a non-test environment'
    )
  }
  const { userId, livemode, jwtClaim } =
    await getDatabaseAuthenticationInfo({
      apiKey,
      __testOnlyOrganizationId,
      customerId,
    })

  // Create effects accumulator and callbacks
  const {
    effects,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
    enqueueTriggerTask,
  } = createEffectsAccumulator()

  let processedEventsCount = 0
  let processedLedgerCommandsCount = 0

  const output = await db.transaction(async (transaction) => {
    if (!jwtClaim) {
      throw new Error('No jwtClaim found')
    }
    const organizationId = jwtClaim.organization_id
    if (!organizationId) {
      throw new Error('No organization_id found in JWT claims')
    }
    if (!userId) {
      throw new Error('No userId found')
    }

    return withRLS(transaction, { jwtClaim, livemode }, async () => {
      const cacheRecomputationContext: CacheRecomputationContext = {
        livemode,
      }
      const paramsForFn: ComprehensiveAuthenticatedTransactionParams =
        {
          transaction,
          userId,
          livemode,
          organizationId,
          cacheRecomputationContext,
          effects,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
          enqueueTriggerTask,
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

      return output
    })
  })

  // Transaction committed successfully - now invalidate caches
  invalidateCacheAfterCommit(effects.cacheInvalidations)

  return {
    output,
    userId,
    organizationId: jwtClaim?.organization_id,
    livemode,
    processedEventsCount,
    processedLedgerCommandsCount,
  }
}

/**
 * Executes a function within an authenticated database transaction and automatically
 * processes events and ledger commands from the transaction output.
 */
export async function comprehensiveAuthenticatedTransaction<T>(
  fn: (
    params: ComprehensiveAuthenticatedTransactionParams
  ) => Promise<Result<T, Error>>,
  options?: AuthenticatedTransactionOptions
): Promise<T> {
  // Static attributes are set at span creation for debugging failed transactions
  const { output } = await traced(
    {
      options: {
        spanName: 'db.comprehensiveAuthenticatedTransaction',
        tracerName: 'db.transaction',
        kind: SpanKind.CLIENT,
        attributes: {
          'db.transaction.type': 'authenticated',
        },
      },
      extractResultAttributes: (data) => ({
        'db.user_id': data.userId,
        'db.organization_id': data.organizationId,
        'db.livemode': data.livemode,
        // Use the actual processed counts, which include both effects callbacks and output
        'db.events_count': data.processedEventsCount,
        'db.ledger_commands_count': data.processedLedgerCommandsCount,
      }),
    },
    () => executeComprehensiveAuthenticatedTransaction(fn, options)
  )()

  if (output.status === 'error') {
    throw output.error
  }
  return output.value
}

export type AuthenticatedProcedureResolver<
  TInput,
  TOutput,
  TContext extends { apiKey?: string; customerId?: string },
> = (input: TInput, ctx: TContext) => Promise<TOutput>

/**
 * Params for authenticated procedure transaction handlers.
 * Provides transactionCtx (TransactionEffectsContext) for passing to business logic functions.
 */
export type AuthenticatedProcedureTransactionParams<
  TInput,
  TContext extends { apiKey?: string; customerId?: string },
> = {
  input: TInput
  ctx: TContext
  transactionCtx: TransactionEffectsContext
}

/**
 * Creates an authenticated procedure that wraps a transaction handler.
 * Delegates to authenticatedProcedureComprehensiveTransaction by wrapping the result.
 */
export const authenticatedProcedureTransaction = <
  TInput,
  TOutput,
  TContext extends { apiKey?: string; customerId?: string },
>(
  handler: (
    params: AuthenticatedProcedureTransactionParams<TInput, TContext>
  ) => Promise<TOutput>
) => {
  return authenticatedProcedureComprehensiveTransaction<
    TInput,
    TOutput,
    TContext
  >(async (params) => {
    const result = await handler(params)
    return Result.ok(result)
  })
}

export const authenticatedProcedureComprehensiveTransaction = <
  TInput,
  TOutput,
  TContext extends { apiKey?: string; customerId?: string },
>(
  handler: (
    params: AuthenticatedProcedureTransactionParams<TInput, TContext>
  ) => Promise<Result<TOutput, Error>>
) => {
  return async (opts: { input: TInput; ctx: TContext }) => {
    return comprehensiveAuthenticatedTransaction(
      (params) => {
        const transactionCtx: TransactionEffectsContext = {
          transaction: params.transaction,
          cacheRecomputationContext: params.cacheRecomputationContext,
          invalidateCache: params.invalidateCache,
          emitEvent: params.emitEvent,
          enqueueLedgerCommand: params.enqueueLedgerCommand,
          enqueueTriggerTask: params.enqueueTriggerTask,
        }
        return handler({
          input: opts.input,
          ctx: opts.ctx,
          transactionCtx,
        })
      },
      {
        apiKey: opts.ctx.apiKey,
        customerId: opts.ctx.customerId,
      }
    )
  }
}

/**
 * Convenience wrapper for authenticatedTransaction that takes a Result-returning
 * function and automatically unwraps the result.
 *
 * Use this at boundaries (routers, API routes, SSR components) where throwing is acceptable.
 *
 * For multi-transaction procedures where you need to handle errors gracefully between
 * transactions, use authenticatedTransaction directly and handle the Result.
 *
 * @param fn - Function that receives TransactionEffectsContext and returns a Result
 * @param options - Authentication options including apiKey
 * @returns The unwrapped value, throwing on error
 *
 * @example
 * ```ts
 * const data = await authenticatedTransactionUnwrap(
 *   async (ctx) => fetchData(ctx),
 *   { apiKey }
 * )
 * ```
 */
export async function authenticatedTransactionUnwrap<T>(
  fn: (ctx: TransactionEffectsContext) => Promise<Result<T, Error>>,
  options: AuthenticatedTransactionOptions
): Promise<T> {
  return comprehensiveAuthenticatedTransaction(async (params) => {
    const ctx: TransactionEffectsContext = {
      transaction: params.transaction,
      cacheRecomputationContext: params.cacheRecomputationContext,
      invalidateCache: params.invalidateCache,
      emitEvent: params.emitEvent,
      enqueueLedgerCommand: params.enqueueLedgerCommand,
      enqueueTriggerTask: params.enqueueTriggerTask,
    }
    return fn(ctx)
  }, options)
}

/**
 * Executes a function within an authenticated database transaction and returns the Result directly.
 *
 * Unlike `comprehensiveAuthenticatedTransaction` which unwraps and throws on error, this function
 * returns the Result for explicit error handling by the caller via `.unwrap()`.
 *
 * Use this when you need to:
 * - Chain multiple transactions and handle errors between them
 * - Return errors to callers without throwing
 * - Migrate code towards explicit Result handling
 *
 * @param fn - Function that receives authenticated transaction parameters and returns a Result
 * @param options - Authentication options including apiKey
 * @returns Promise resolving to the Result (not unwrapped)
 *
 * @example
 * ```ts
 * const result = await authenticatedTransactionWithResult(async ({ transaction, emitEvent, organizationId }) => {
 *   // ... perform operations ...
 *   emitEvent(event1)
 *   return Result.ok(someValue)
 * }, { apiKey })
 *
 * // At router/API boundary, unwrap to convert to exceptions:
 * return result.unwrap()
 *
 * // Or handle errors explicitly:
 * if (Result.isError(result)) {
 *   // handle error
 * }
 * ```
 */
export async function authenticatedTransactionWithResult<T>(
  fn: (
    params: ComprehensiveAuthenticatedTransactionParams
  ) => Promise<Result<T, Error>>,
  options?: AuthenticatedTransactionOptions
): Promise<Result<T, Error>> {
  try {
    const { output } = await traced(
      {
        options: {
          spanName: 'db.authenticatedTransactionWithResult',
          tracerName: 'db.transaction',
          kind: SpanKind.CLIENT,
          attributes: {
            'db.transaction.type': 'authenticated',
          },
        },
        extractResultAttributes: (data) => ({
          'db.user_id': data.userId,
          'db.organization_id': data.organizationId,
          'db.livemode': data.livemode,
          'db.events_count': data.processedEventsCount,
          'db.ledger_commands_count':
            data.processedLedgerCommandsCount,
        }),
      },
      () => executeComprehensiveAuthenticatedTransaction(fn, options)
    )()

    return output
  } catch (error) {
    // Convert thrown errors back to Result.err
    // This happens when the callback returns Result.err, which triggers
    // a throw inside executeComprehensiveAuthenticatedTransaction to roll back the transaction
    return Result.err(
      error instanceof Error ? error : new Error(String(error))
    )
  }
}
