import { sql } from 'drizzle-orm'
import type { TransactionContext } from '@/utils/cache'
import db from './client'
import type { DbTransaction } from './types'

type MerchantTransactionContext = Extract<
  TransactionContext,
  { type: 'merchant' }
>

type CustomerTransactionContext = Extract<
  TransactionContext,
  { type: 'customer' }
>

/**
 * Creates a transaction with merchant RLS context for recomputation.
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
export async function recomputeWithMerchantContext<T>(
  context: MerchantTransactionContext,
  fn: (transaction: DbTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (transaction) => {
    // Construct minimal JWT claim for RLS
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

    // Set the RLS context using parameterized binding for safety
    const jwtClaimJson = JSON.stringify(jwtClaim)
    const livemodeStr = Boolean(context.livemode).toString()
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', ${jwtClaimJson}, TRUE)`
    )
    await transaction.execute(
      sql`SET LOCAL ROLE ${sql.raw(jwtClaim.role)};`
    )
    await transaction.execute(
      sql`SELECT set_config('app.livemode', ${livemodeStr}, TRUE);`
    )

    const result = await fn(transaction)

    // Reset role at end of transaction
    await transaction.execute(sql`RESET ROLE;`)

    return result
  })
}

/**
 * Creates a transaction with customer RLS context for recomputation.
 * Sets JWT claims based on stored customer identity.
 *
 * This is used by the cache recomputation system to re-execute
 * cached functions for customer billing portal operations with
 * the same RLS context as the original call.
 */
export async function recomputeWithCustomerContext<T>(
  context: CustomerTransactionContext,
  fn: (transaction: DbTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (transaction) => {
    // Construct minimal JWT claim for customer RLS
    const jwtClaim = {
      role: 'customer',
      sub: context.userId,
      email: 'recompute@internal',
      organization_id: context.organizationId,
      auth_type: 'webapp' as const,
      user_metadata: {
        id: context.userId,
        user_metadata: {},
        aud: 'recompute',
        email: 'recompute@internal',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        role: 'customer',
        app_metadata: {
          provider: 'customerBillingPortal',
          customer_id: context.customerId,
        },
      },
      app_metadata: {
        provider: 'customerBillingPortal',
        customer_id: context.customerId,
      },
    }

    // Clear any existing JWT claims
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )

    // Set the RLS context using parameterized binding for safety
    const jwtClaimJson = JSON.stringify(jwtClaim)
    const livemodeStr = Boolean(context.livemode).toString()
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', ${jwtClaimJson}, TRUE)`
    )
    await transaction.execute(
      sql`SET LOCAL ROLE ${sql.raw(jwtClaim.role)};`
    )
    await transaction.execute(
      sql`SELECT set_config('app.livemode', ${livemodeStr}, TRUE);`
    )

    const result = await fn(transaction)

    // Reset role at end of transaction
    await transaction.execute(sql`RESET ROLE;`)

    return result
  })
}
