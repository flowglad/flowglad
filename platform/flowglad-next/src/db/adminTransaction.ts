import { AdminTransactionParams } from '@/db/types'
import db from './client'
import { sql } from 'drizzle-orm'
import { isNil } from '@/utils/core'
import { Event } from './schema/events'
import {
  bulkInsertOrDoNothingEvents,
  bulkInsertOrDoNothingEventsByHash,
} from './tableMethods/eventMethods'

interface AdminTransactionOptions {
  livemode?: boolean
}
// This method needs to be in its own module, because
// comingling it with `authenticatedTransaction` in the same file
// can cause issues where we execute stackAuth code globally that
// only works in the context of a nextjs sessionful runtime.

export async function adminTransaction<T>(
  fn: (params: AdminTransactionParams) => Promise<T>,
  options: AdminTransactionOptions = {}
) {
  const { livemode = true } = options
  return db.transaction(async (transaction) => {
    /**
     * Reseting the role and request.jwt.claims here,
     * becuase the auth state seems to be returned to the client "dirty",
     * with the role from the previous session still applied.
     */
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )

    const resp = await fn({
      transaction,
      userId: 'ADMIN',
      livemode: isNil(livemode) ? true : livemode,
    })
    await transaction.execute(sql`RESET ROLE;`)
    return resp
  })
}

export async function eventfulAdminTransaction<T>(
  fn: (
    params: AdminTransactionParams
  ) => Promise<[T, Event.Insert[]]>,
  options: AdminTransactionOptions
) {
  return adminTransaction(async (params) => {
    const [result, eventInserts] = await fn(params)
    await bulkInsertOrDoNothingEventsByHash(
      eventInserts,
      params.transaction
    )
    return result
  }, options)
}
