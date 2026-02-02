import { SpanKind } from '@opentelemetry/api'
import { Result } from 'better-result'
import type {
  AuthenticatedTransactionParams,
  CacheRecomputationContext,
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
 * Core comprehensive authenticated transaction logic without tracing.
 * Returns the full Result plus auth info and processed counts so the traced wrapper can extract accurate metrics.
 */
const executeComprehensiveAuthenticatedTransaction = async <T>(
  fn: (
    params: AuthenticatedTransactionParams
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
      const paramsForFn: AuthenticatedTransactionParams = {
        transaction,
        userId,
        livemode,
        organizationId,
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
    const result = await authenticatedTransaction(
      (params) => {
        const transactionCtx: TransactionEffectsContext = {
          transaction: params.transaction,
          cacheRecomputationContext: params.cacheRecomputationContext,
          invalidateCache: params.invalidateCache,
          emitEvent: params.emitEvent,
          enqueueLedgerCommand: params.enqueueLedgerCommand,
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
    // Throw the original error directly to preserve TRPCError type
    // (using .unwrap() would wrap it in a Panic error)
    if (result.status === 'error') {
      throw result.error
    }
    return result.value
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
  const result = await authenticatedTransaction(async (params) => {
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
 * Executes a function within an authenticated database transaction.
 * The callback receives full transaction parameters including userId, organizationId, and livemode.
 *
 * The callback is responsible for returning a Result - this function passes through whatever
 * Result the callback returns.
 *
 * @param fn - Function that receives authenticated transaction parameters and returns a Result
 * @param options - Authentication options including apiKey
 * @returns Promise resolving to the Result returned by the callback
 *
 * @example
 * ```ts
 * const result = await authenticatedTransaction(async ({ transaction, organizationId }) => {
 *   const customer = await selectCustomerById(customerId, transaction)
 *   if (!customer) {
 *     return Result.err(new NotFoundError('Customer', customerId))
 *   }
 *   return Result.ok(customer)
 * }, { apiKey })
 * ```
 */
export async function authenticatedTransaction<T>(
  fn: (
    params: AuthenticatedTransactionParams
  ) => Promise<Result<T, Error>>,
  options?: AuthenticatedTransactionOptions
): Promise<Result<T, Error>> {
  try {
    const { output } = await traced(
      {
        options: {
          spanName: 'db.authenticatedTransaction',
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
