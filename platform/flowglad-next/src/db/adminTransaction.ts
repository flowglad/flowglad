import { AdminTransactionParams } from '@/db/types'
import db from './client'
import { sql } from 'drizzle-orm'
import { isNil } from '@/utils/core'

export const adminTransaction = async <T>(
  fn: (params: AdminTransactionParams) => Promise<T>,
  {
    livemode = true,
  }: {
    livemode?: boolean
  } = {}
) => {
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
