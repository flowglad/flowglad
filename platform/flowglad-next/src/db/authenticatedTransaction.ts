import { SpanKind } from '@opentelemetry/api'
import { sql } from 'drizzle-orm'
import type {
  AuthenticatedTransactionParams,
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
import { isError, type Result } from './transactionEnhacementTypes'

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
  fn: (params: AuthenticatedTransactionParams) => Promise<T>,
  options?: AuthenticatedTransactionOptions
): Promise<T> {
  return comprehensiveAuthenticatedTransaction(async (params) => {
    const result = await fn(params)
    return { result }
  }, options)
}

/**
 * Core comprehensive authenticated transaction logic without tracing.
 * Returns the full TransactionOutput plus auth info and processed counts so the traced wrapper can extract accurate metrics.
 */
const executeComprehensiveAuthenticatedTransaction = async <T>(
  fn: (
    params: ComprehensiveAuthenticatedTransactionParams
  ) => Promise<Result<T>>,
  options?: AuthenticatedTransactionOptions
): Promise<{
  output: Result<T>
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

    // Set RLS context
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', '${sql.raw(
        JSON.stringify(jwtClaim)
      )}', TRUE)`
    )
    await transaction.execute(
      sql`SET LOCAL ROLE ${sql.raw(jwtClaim.role)};`
    )
    await transaction.execute(
      sql`SELECT set_config('app.livemode', '${sql.raw(
        Boolean(livemode).toString()
      )}', TRUE);`
    )

    const paramsForFn: ComprehensiveAuthenticatedTransactionParams = {
      transaction,
      userId,
      livemode,
      organizationId,
      effects,
      invalidateCache,
      emitEvent,
      enqueueLedgerCommand,
    }

    const output = await fn(paramsForFn)

    // Check for error early to skip effects and roll back transaction
    if (isError(output)) {
      throw output.error
    }

    // Process accumulated effects
    const counts = await processEffectsInTransaction(
      effects,
      transaction
    )
    processedEventsCount = counts.eventsCount
    processedLedgerCommandsCount = counts.ledgerCommandsCount

    // RESET ROLE is not strictly necessary with SET LOCAL ROLE, as the role is session-local.
    // However, keeping it doesn't harm and can be an explicit cleanup.
    await transaction.execute(sql`RESET ROLE;`)

    return output
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
  ) => Promise<Result<T>>,
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

  if (isError(output)) {
    throw output.error
  }
  return output.result
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
    return { result }
  })
}

export const authenticatedProcedureComprehensiveTransaction = <
  TInput,
  TOutput,
  TContext extends { apiKey?: string; customerId?: string },
>(
  handler: (
    params: AuthenticatedProcedureTransactionParams<TInput, TContext>
  ) => Promise<Result<TOutput>>
) => {
  return async (opts: { input: TInput; ctx: TContext }) => {
    return comprehensiveAuthenticatedTransaction(
      (params) => {
        const transactionCtx: TransactionEffectsContext = {
          transaction: params.transaction,
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
  }
}
