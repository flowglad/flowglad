import { SpanKind } from '@opentelemetry/api'
import { Result } from 'better-result'
import type {
  AuthenticatedTransactionParams,
  TransactionEffectsContext,
} from '@/db/types'
import type { CacheRecomputationContext } from '@/utils/cache'
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
 * Core authenticated transaction logic without tracing.
 * Returns the full Result plus auth info and processed counts so the traced wrapper can extract accurate metrics.
 */
const executeAuthenticatedTransaction = async <T>(
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
    return {
      output: Result.err(
        new Error(
          'Attempted to use test organization id in a non-test environment'
        )
      ),
      userId: '',
      organizationId: undefined,
      livemode: false,
      processedEventsCount: 0,
      processedLedgerCommandsCount: 0,
    }
  }

  let userId = ''
  let livemode = false
  let jwtClaim:
    | Awaited<
        ReturnType<typeof getDatabaseAuthenticationInfo>
      >['jwtClaim']
    | null = null

  try {
    const authInfo = await getDatabaseAuthenticationInfo({
      apiKey,
      __testOnlyOrganizationId,
      customerId,
    })
    userId = authInfo.userId
    livemode = authInfo.livemode
    jwtClaim = authInfo.jwtClaim
  } catch (error) {
    return {
      output: Result.err(
        error instanceof Error ? error : new Error(String(error))
      ),
      userId: '',
      organizationId: undefined,
      livemode: false,
      processedEventsCount: 0,
      processedLedgerCommandsCount: 0,
    }
  }

  // Create effects accumulator and callbacks
  const {
    effects,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
  } = createEffectsAccumulator()

  let processedEventsCount = 0
  let processedLedgerCommandsCount = 0

  try {
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

      return withRLS(
        transaction,
        { jwtClaim, livemode },
        async () => {
          // Construct transaction context based on JWT role, not the optional customerId parameter.
          // This is important because customer billing portal auth sets role='customer' in the JWT
          // even when customerId is not explicitly passed as a parameter.
          const cacheRecomputationContext: CacheRecomputationContext =
            jwtClaim.role === 'customer'
              ? {
                  type: 'customer',
                  livemode,
                  organizationId,
                  userId,
                  // Prefer explicit customerId parameter, fall back to JWT metadata
                  customerId:
                    customerId ??
                    (jwtClaim.user_metadata.app_metadata
                      ?.customer_id as string | undefined) ??
                    '',
                }
              : {
                  type: 'merchant',
                  livemode,
                  organizationId,
                  userId,
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
        }
      )
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
  } catch (error) {
    // Convert thrown errors back to Result for consistent return type
    return {
      output: Result.err(
        error instanceof Error ? error : new Error(String(error))
      ),
      userId,
      organizationId: jwtClaim?.organization_id,
      livemode,
      processedEventsCount,
      processedLedgerCommandsCount,
    }
  }
}

/**
 * Executes a function within an authenticated database transaction and automatically
 * processes events and ledger commands from the transaction output.
 *
 * Returns a Result to enable multi-transaction procedures to handle errors gracefully.
 * Use `.unwrap()` at the router/API boundary to convert back to exceptions.
 *
 * @param fn - Function that receives authenticated transaction parameters and returns a Result
 * @param options - Authentication options including apiKey
 * @returns Promise resolving to a Result containing either the value or an error
 *
 * @example
 * ```ts
 * const result = await authenticatedTransaction(async ({ transaction, emitEvent }) => {
 *   // ... perform operations ...
 *   emitEvent(event1, event2)
 *   return Result.ok(someValue)
 * }, { apiKey })
 *
 * // At router boundary:
 * return result.unwrap()
 * ```
 */
export async function authenticatedTransaction<T>(
  fn: (
    params: AuthenticatedTransactionParams
  ) => Promise<Result<T, Error>>,
  options?: AuthenticatedTransactionOptions
): Promise<Result<T, Error>> {
  // Static attributes are set at span creation for debugging failed transactions
  const { output } = await traced(
    {
      options: {
        spanName: 'db.authenticated_transaction',
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
    () => executeAuthenticatedTransaction(fn, options)
  )()

  return output
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
 * Returns a function that takes TRPC-style {input, ctx} and executes
 * the handler within an authenticated transaction.
 *
 * Automatically unwraps the Result and throws on error, making it compatible
 * with TRPC's expected return type (plain values that can throw).
 */
export const authenticatedProcedureTransaction = <
  TInput,
  TOutput,
  TContext extends { apiKey?: string; customerId?: string },
>(
  handler: (
    params: AuthenticatedProcedureTransactionParams<TInput, TContext>
  ) => Promise<Result<TOutput, Error>>
) => {
  return async (opts: {
    input: TInput
    ctx: TContext
  }): Promise<TOutput> => {
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
    return result.unwrap()
  }
}

/**
 * Convenience wrapper for authenticatedTransaction that automatically unwraps the result.
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

  return result.unwrap()
}
