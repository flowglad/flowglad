import { SpanKind } from '@opentelemetry/api'
import { sql } from 'drizzle-orm'
import type {
  AuthenticatedTransactionParams,
  TransactionEffects,
} from '@/db/types'
import {
  type CacheDependencyKey,
  invalidateDependencies,
} from '@/utils/cache'
import core from '@/utils/core'
import { traced } from '@/utils/tracing'
import db from './client'
import { getDatabaseAuthenticationInfo } from './databaseAuthentication'
import { processLedgerCommand } from './ledgerManager/ledgerManager'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'
import type { Event } from './schema/events'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'
import type { TransactionOutput } from './transactionEnhacementTypes'

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
    params: AuthenticatedTransactionParams
  ) => Promise<TransactionOutput<T>>,
  options?: AuthenticatedTransactionOptions
): Promise<{
  output: TransactionOutput<T>
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

    const paramsForFn: AuthenticatedTransactionParams = {
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

    // RESET ROLE is not strictly necessary with SET LOCAL ROLE, as the role is session-local.
    // However, keeping it doesn't harm and can be an explicit cleanup.
    await transaction.execute(sql`RESET ROLE;`)

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
    params: AuthenticatedTransactionParams
  ) => Promise<TransactionOutput<T>>,
  options?: AuthenticatedTransactionOptions
): Promise<T> {
  // Static attributes are set at span creation for debugging failed transactions
  const {
    output,
    processedEventsCount,
    processedLedgerCommandsCount,
  } = await traced(
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

  return output.result
}

/**
 * Wrapper around comprehensiveAuthenticatedTransaction for functions that return
 * a tuple of [result, events]. Adapts the old signature to TransactionOutput.
 */
export function eventfulAuthenticatedTransaction<T>(
  fn: (
    params: AuthenticatedTransactionParams
  ) => Promise<[T, Event.Insert[]]>,
  options: AuthenticatedTransactionOptions = {}
): Promise<T> {
  return comprehensiveAuthenticatedTransaction(async (params) => {
    const [result, eventInserts] = await fn(params)
    return {
      result,
      eventsToInsert: eventInserts,
    }
  }, options)
}

export type AuthenticatedProcedureResolver<
  TInput,
  TOutput,
  TContext extends { apiKey?: string; customerId?: string },
> = (input: TInput, ctx: TContext) => Promise<TOutput>

export type AuthenticatedProcedureTransactionParams<
  TInput,
  TOutput,
  TContext extends { apiKey?: string; customerId?: string },
> = AuthenticatedTransactionParams & {
  input: TInput
  ctx: TContext
}

export type AuthenticatedProcedureTransactionHandler<
  TInput,
  TOutput,
  TContext extends { apiKey?: string; customerId?: string },
> = (
  params: AuthenticatedProcedureTransactionParams<
    TInput,
    TOutput,
    TContext
  >
) => Promise<TOutput>

/**
 * Creates an authenticated procedure that wraps a transaction handler.
 * Delegates to authenticatedProcedureComprehensiveTransaction by wrapping the result.
 */
export const authenticatedProcedureTransaction = <
  TInput,
  TOutput,
  TContext extends { apiKey?: string; customerId?: string },
>(
  handler: AuthenticatedProcedureTransactionHandler<
    TInput,
    TOutput,
    TContext
  >
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
    params: AuthenticatedProcedureTransactionParams<
      TInput,
      TOutput,
      TContext
    >
  ) => Promise<TransactionOutput<TOutput>>
) => {
  return async (opts: { input: TInput; ctx: TContext }) => {
    return comprehensiveAuthenticatedTransaction(
      (params) =>
        handler({ ...params, input: opts.input, ctx: opts.ctx }),
      {
        apiKey: opts.ctx.apiKey,
        customerId: opts.ctx.customerId,
      }
    )
  }
}

export function eventfulAuthenticatedProcedureTransaction<
  TInput,
  TOutput,
  TContext extends { apiKey?: string; customerId?: string },
>(
  handler: (
    params: AuthenticatedProcedureTransactionParams<
      TInput,
      TOutput,
      TContext
    >
  ) => Promise<[TOutput, Event.Insert[]]>
) {
  return authenticatedProcedureTransaction<TInput, TOutput, TContext>(
    async (params) => {
      const [result, eventInserts] = await handler(params)
      await bulkInsertOrDoNothingEventsByHash(
        eventInserts,
        params.transaction
      )
      return result
    }
  )
}
