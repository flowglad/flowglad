import { sql } from 'drizzle-orm'
import type { DbTransaction } from './types'

/**
 * RLS context configuration for setting up Row Level Security in PostgreSQL.
 */
export interface RLSContext {
  /**
   * JWT claims object to set in the transaction.
   * Must have a `role` property that will be used for SET LOCAL ROLE.
   */
  jwtClaim: { role: string; [key: string]: unknown }
  /**
   * Livemode flag to set in the transaction.
   */
  livemode: boolean
}

/**
 * Executes a function within an RLS context.
 *
 * This helper:
 * 1. Clears any existing JWT claims
 * 2. Sets the new JWT claims
 * 3. Sets the PostgreSQL role based on jwtClaim.role
 * 4. Sets the app.livemode configuration
 * 5. Executes the provided function
 * 6. Resets the role
 *
 * @param transaction - The database transaction
 * @param context - The RLS context containing JWT claims and livemode
 * @param fn - The function to execute within the RLS context
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * await db.transaction(async (transaction) => {
 *   return withRLS(
 *     transaction,
 *     { jwtClaim: { role: 'merchant', sub: userId, ... }, livemode: true },
 *     async () => {
 *       // Operations run with RLS context
 *       return await selectCustomers({}, transaction)
 *     }
 *   )
 * })
 * ```
 */
export async function withRLS<T>(
  transaction: DbTransaction,
  context: RLSContext,
  fn: () => Promise<T>
): Promise<T> {
  const { jwtClaim, livemode } = context

  // Clear any existing JWT claims
  await transaction.execute(
    sql`SELECT set_config('request.jwt.claims', NULL, true);`
  )

  // Set the RLS context using parameterized binding for safety
  const jwtClaimJson = JSON.stringify(jwtClaim)
  const livemodeStr = Boolean(livemode).toString()

  await transaction.execute(
    sql`SELECT set_config('request.jwt.claims', ${jwtClaimJson}, TRUE)`
  )
  await transaction.execute(
    sql`SET LOCAL ROLE ${sql.raw(jwtClaim.role)};`
  )
  await transaction.execute(
    sql`SELECT set_config('app.livemode', ${livemodeStr}, TRUE);`
  )

  const result = await fn()

  // Reset role at end of transaction
  // Not strictly necessary with SET LOCAL ROLE (session-local),
  // but explicit cleanup is good practice
  await transaction.execute(sql`RESET ROLE;`)

  return result
}
