import { AuthenticatedTransactionParams } from '@/db/types'
import db from './client'
import { sql } from 'drizzle-orm'
import { getDatabaseAuthenticationInfo } from './databaseAuthentication'

export async function authenticatedTransaction<T>(
  fn: (params: AuthenticatedTransactionParams) => Promise<T>,
  {
    apiKey,
  }: {
    apiKey?: string
  } = {}
) {
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
