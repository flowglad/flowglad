import { AuthenticatedTransactionParams } from '@/db/types'
import db from './client'
import { sql } from 'drizzle-orm'
import { getDatabaseAuthenticationInfo } from './databaseAuthentication'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'
import { Event } from './schema/events'

interface AuthenticatedTransactionOptions {
  apiKey?: string
}
export async function authenticatedTransaction<T>(
  fn: (params: AuthenticatedTransactionParams) => Promise<T>,
  options: AuthenticatedTransactionOptions
) {
  const { apiKey } = options
  const { userId, livemode, jwtClaim } =
    await getDatabaseAuthenticationInfo(apiKey)

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

export function eventfulAuthenticatedTransaction<T>(
  fn: (
    params: AuthenticatedTransactionParams
  ) => Promise<[T, Event.Insert[]]>,
  options: AuthenticatedTransactionOptions
) {
  return authenticatedTransaction(async (params) => {
    const [result, eventInserts] = await fn(params)
    await bulkInsertOrDoNothingEventsByHash(
      eventInserts,
      params.transaction
    )
    return result
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
