import {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import db from './client'
import { sql } from 'drizzle-orm'
import { getDatabaseAuthenticationInfo } from './databaseAuthentication'
import { Event } from './schema/events'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'

// New imports for ledger and transaction output types
import { TransactionOutput } from './transactionEnhacementTypes'
import { processLedgerCommand } from './ledgerManager/ledgerManager'

interface AuthenticatedTransactionOptions {
  apiKey?: string
}

/**
 * Original authenticatedTransaction. Consider deprecating or refactoring.
 */
export async function authenticatedTransaction<T>(
  fn: (params: AuthenticatedTransactionParams) => Promise<T>,
  options?: AuthenticatedTransactionOptions
) {
  const { apiKey } = options ?? {}
  const { userId, livemode, jwtClaim } =
    await getDatabaseAuthenticationInfo(apiKey)
  console.log('userId, livemode, jwtClaim', {
    userId,
    livemode,
    jwtClaim,
  })
  return db.transaction(async (transaction) => {
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
      sql`set role '${sql.raw(jwtClaim.role)}'`
    )
    await transaction.execute(
      sql`SELECT set_config('app.livemode', '${sql.raw(
        Boolean(livemode).toString()
      )}', TRUE);`
    )
    const resp = await fn({ transaction, userId, livemode })
    /**
     * Reseting the role and request.jwt.claims here,
     * becuase the auth state seems to be returned to the client "dirty",
     * with the role from the previous session still applied.
     */
    await transaction.execute(sql`RESET ROLE;`)

    return resp
  })
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
  const { apiKey } = options ?? {}
  const { userId, livemode, jwtClaim } =
    await getDatabaseAuthenticationInfo(apiKey)

  return db.transaction(async (transaction) => {
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
      sql`SET LOCAL ROLE '${sql.raw(jwtClaim.role)}';`
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

    // Process events if any
    if (output.eventsToLog && output.eventsToLog.length > 0) {
      await bulkInsertOrDoNothingEventsByHash(
        output.eventsToLog,
        transaction as DbTransaction
      )
    }

    // Process ledger command if any
    if (output.ledgerCommand) {
      await processLedgerCommand(output.ledgerCommand, transaction)
    }

    // RESET ROLE is not strictly necessary with SET LOCAL ROLE, as the role is session-local.
    // However, keeping it doesn't harm and can be an explicit cleanup.
    await transaction.execute(sql`RESET ROLE;`)

    return output.result
  })
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
) {
  return comprehensiveAuthenticatedTransaction(async (params) => {
    const [result, eventInserts] = await fn(params)
    return {
      result,
      eventsToLog: eventInserts,
    }
  }, options)
}

export type AuthenticatedProcedureResolver<
  TInput,
  TOutput,
  TContext extends { apiKey?: string },
> = (input: TInput, ctx: TContext) => Promise<TOutput>

export type AuthenticatedProcedureTransactionParams<
  TInput,
  TOutput,
  TContext extends { apiKey?: string },
> = AuthenticatedTransactionParams & {
  input: TInput
  ctx: TContext
}

export const authenticatedProcedureTransaction = <
  TInput,
  TOutput,
  TContext extends { apiKey?: string },
>(
  handler: (
    params: AuthenticatedProcedureTransactionParams<
      TInput,
      TOutput,
      TContext
    >
  ) => Promise<TOutput>
) => {
  return async (opts: { input: TInput; ctx: TContext }) => {
    return authenticatedTransaction(
      (params) =>
        handler({ ...params, input: opts.input, ctx: opts.ctx }),
      {
        apiKey: opts.ctx.apiKey,
      }
    )
  }
}

export const authenticatedProcedureComprehensiveTransaction = <
  TInput,
  TOutput,
  TContext extends { apiKey?: string },
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
      }
    )
  }
}

export function eventfulAuthenticatedProcedureTransaction<
  TInput,
  TOutput,
  TContext extends { apiKey?: string },
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
