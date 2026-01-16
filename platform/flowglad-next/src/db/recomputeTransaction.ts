import type { TransactionContext } from '@/utils/cache'
import db from './client'
import type { DbTransaction } from './types'
import { withRLS } from './withRLS'

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

    return withRLS(
      transaction,
      { jwtClaim, livemode: context.livemode },
      () => fn(transaction)
    )
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

    return withRLS(
      transaction,
      { jwtClaim, livemode: context.livemode },
      () => fn(transaction)
    )
  })
}
