import { sql } from 'drizzle-orm'
import type { TransactionContext } from '@/utils/cache'
import db from './client'
import type { DbTransaction } from './types'

type AuthenticatedTransactionContext = Extract<
  TransactionContext,
  { type: 'authenticated' }
>

/**
 * Creates a transaction with RLS context for recomputation.
 * Sets JWT claims based on stored identity (not credentials).
 *
 * This is used by the cache recomputation system to re-execute
 * cached functions with the same RLS context as the original call.
 * Unlike authenticatedTransaction, this function does NOT:
 * - Look up API keys or sessions
 * - Process events or ledger commands
 * - Handle transaction effects
 *
 * It simply sets up the minimal RLS context needed to re-run a query.
 */
export async function recomputeWithAuthenticatedContext<T>(
  context: AuthenticatedTransactionContext,
  fn: (transaction: DbTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (transaction) => {
    // Construct minimal JWT claim for RLS
    // The role is 'merchant' because authenticated context is for merchant operations
    // Customer billing portal would use a different path
    const jwtClaim = {
      role: 'merchant',
      sub: context.userId,
      email: 'recompute@internal',
      organization_id: context.organizationId,
      auth_type: 'api_key' as const, // Use api_key to bypass focused membership check
      user_metadata: {
        id: context.userId,
        user_metadata: {},
        aud: 'recompute',
        email: 'recompute@internal',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        role: 'merchant',
        app_metadata: {
          provider: 'recompute',
        },
      },
      app_metadata: { provider: 'recompute' },
    }

    // Clear any existing JWT claims
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )

    // Set the RLS context
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
        Boolean(context.livemode).toString()
      )}', TRUE);`
    )

    const result = await fn(transaction)

    // Reset role at end of transaction
    await transaction.execute(sql`RESET ROLE;`)

    return result
  })
}
