import { SpanKind } from '@opentelemetry/api'
import { sql } from 'drizzle-orm'
import type {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import core from '@/utils/core'
import { traced } from '@/utils/tracing'
import db from './client'
import { getDatabaseAuthenticationInfo } from './databaseAuthentication'
import { processLedgerCommand } from './ledgerManager/ledgerManager'
import type { Event } from './schema/events'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'
// New imports for ledger and transaction output types
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
 * Core authenticated transaction logic without tracing.
 */
const executeAuthenticatedTransaction = async <T>(
  fn: (params: AuthenticatedTransactionParams) => Promise<T>,
  options?: AuthenticatedTransactionOptions
): Promise<{
  result: T
  userId: string
  organizationId?: string
  livemode: boolean
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

  const result = await db.transaction(async (transaction) => {
    if (!jwtClaim) {
      throw new Error('No jwtClaim found')
    }
    if (!userId) {
      throw new Error('No userId found')
    }

    /**
     * Clear whatever state may have been set by previous uses of the connection.
     * This shouldn't be a concern, but we've seen some issues where connections keep
     * state between transactions.
     */
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )

    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', '${sql.raw(
        JSON.stringify(jwtClaim)
      )}', TRUE)`
    )

    await transaction.execute(
      sql`SET LOCAL ROLE ${sql.raw(jwtClaim.role)}`
    )
    await transaction.execute(
      sql`SELECT set_config('app.livemode', '${sql.raw(
        Boolean(livemode).toString()
      )}', TRUE);`
    )
    const resp = await fn({
      transaction,
      userId,
      livemode,
      organizationId: jwtClaim.organization_id,
    })
    /**
     * Reseting the role and request.jwt.claims here,
     * becuase the auth state seems to be returned to the client "dirty",
     * with the role from the previous session still applied.
     */
    await transaction.execute(sql`RESET ROLE;`)

    return resp
  })

  return {
    result,
    userId,
    organizationId: jwtClaim?.organization_id,
    livemode,
  }
}

/**
 * Original authenticatedTransaction. Consider deprecating or refactoring.
 */
export async function authenticatedTransaction<T>(
  fn: (params: AuthenticatedTransactionParams) => Promise<T>,
  options?: AuthenticatedTransactionOptions
): Promise<T> {
  // We need to execute and get the auth info to set span attributes
  // The traced combinator wraps the entire operation including auth lookup
  // Static attributes are set at span creation for debugging failed transactions
  const { result } = await traced(
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
      }),
    },
    () => executeAuthenticatedTransaction(fn, options)
  )()

  return result
}

/**
 * Core comprehensive authenticated transaction logic without tracing.
 * Returns the full TransactionOutput plus auth info so the traced wrapper can extract metrics.
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
}> => {
  const { apiKey, __testOnlyOrganizationId, customerId } =
    options ?? {}
  const { userId, livemode, jwtClaim } =
    await getDatabaseAuthenticationInfo({
      apiKey,
      __testOnlyOrganizationId,
      customerId,
    })

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

    const paramsForFn = {
      transaction,
      userId,
      livemode,
      organizationId,
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
        transaction as DbTransaction
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

    // RESET ROLE is not strictly necessary with SET LOCAL ROLE, as the role is session-local.
    // However, keeping it doesn't harm and can be an explicit cleanup.
    await transaction.execute(sql`RESET ROLE;`)

    return output
  })

  return {
    output,
    userId,
    organizationId: jwtClaim?.organization_id,
    livemode,
  }
}

/**
 * New comprehensive authenticated transaction handler.
 */
export async function comprehensiveAuthenticatedTransaction<T>(
  fn: (
    params: AuthenticatedTransactionParams
  ) => Promise<TransactionOutput<T>>,
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
        'db.events_count': data.output.eventsToInsert?.length ?? 0,
        'db.ledger_commands_count': data.output.ledgerCommand
          ? 1
          : (data.output.ledgerCommands?.length ?? 0),
      }),
    },
    () => executeComprehensiveAuthenticatedTransaction(fn, options)
  )()

  return output.result
}

/**
 * Original eventfulAuthenticatedTransaction.
 * Consider deprecating. If kept, adapt to use comprehensiveAuthenticatedTransaction.
 */
export function eventfulAuthenticatedTransaction<T>(
  fn: (
    params: AuthenticatedTransactionParams
  ) => Promise<[T, Event.Insert[]]>,
  options: AuthenticatedTransactionOptions
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
  return async (opts: { input: TInput; ctx: TContext }) => {
    return authenticatedTransaction(
      (params) =>
        handler({ ...params, input: opts.input, ctx: opts.ctx }),
      {
        apiKey: opts.ctx.apiKey,
        customerId: opts.ctx.customerId,
      }
    )
  }
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
