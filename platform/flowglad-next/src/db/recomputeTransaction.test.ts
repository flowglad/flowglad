import { describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { TransactionContext } from '@/utils/cache'
import {
  recomputeWithCustomerContext,
  recomputeWithMerchantContext,
} from './recomputeTransaction'
import type { DbTransaction } from './types'

// Schema for parsing JWT claims from the database
const jwtClaimsSchema = z.object({
  role: z.string(),
  sub: z.string(),
  email: z.string(),
  organization_id: z.string(),
  auth_type: z.string(),
})

// Schema for parsing livemode setting
const livemodeSettingSchema = z
  .object({ livemode: z.string() })
  .array()

/**
 * Read the current JWT claims from the database session.
 */
async function getCurrentJwtClaims(transaction: DbTransaction) {
  const rows = await transaction.execute(
    sql`SELECT current_setting('request.jwt.claims', true) as claims`
  )
  const parsed = z
    .object({ claims: z.string().nullable() })
    .array()
    .parse(rows)
  if (!parsed[0]?.claims) {
    return null
  }
  return jwtClaimsSchema.parse(JSON.parse(parsed[0].claims))
}

/**
 * Read the current livemode setting from the database session.
 */
async function getCurrentLivemode(
  transaction: DbTransaction
): Promise<boolean | null> {
  const rows = await transaction.execute(
    sql`SELECT current_setting('app.livemode', true) as livemode`
  )
  const parsed = livemodeSettingSchema.parse(rows)
  if (!parsed[0]?.livemode) {
    return null
  }
  return parsed[0].livemode === 'true'
}

describe('recomputeWithMerchantContext', () => {
  it('sets JWT claims with correct user and organization from context', async () => {
    const context: Extract<TransactionContext, { type: 'merchant' }> =
      {
        type: 'merchant',
        livemode: true,
        organizationId: 'org_test_12345',
        userId: 'user_test_67890',
      }

    const result = await recomputeWithMerchantContext(
      context,
      async (transaction) => {
        const claims = await getCurrentJwtClaims(transaction)

        // JWT claims should be set with the context values
        // Verify claims object exists and has expected structure
        expect(claims?.sub).toBe(context.userId)
        expect(claims?.organization_id).toBe(context.organizationId)
        expect(claims?.role).toBe('merchant')
        expect(claims?.auth_type).toBe('api_key')

        return 'success'
      }
    )

    expect(result).toBe('success')
  })

  it('sets livemode configuration correctly for live mode', async () => {
    const context: Extract<TransactionContext, { type: 'merchant' }> =
      {
        type: 'merchant',
        livemode: true,
        organizationId: 'org_live_test',
        userId: 'user_live_test',
      }

    const livemode = await recomputeWithMerchantContext(
      context,
      async (transaction) => {
        return getCurrentLivemode(transaction)
      }
    )

    expect(livemode).toBe(true)
  })

  it('sets livemode configuration correctly for test mode', async () => {
    const context: Extract<TransactionContext, { type: 'merchant' }> =
      {
        type: 'merchant',
        livemode: false,
        organizationId: 'org_test_mode',
        userId: 'user_test_mode',
      }

    const livemode = await recomputeWithMerchantContext(
      context,
      async (transaction) => {
        return getCurrentLivemode(transaction)
      }
    )

    expect(livemode).toBe(false)
  })

  it('executes callback and returns its result', async () => {
    const context: Extract<TransactionContext, { type: 'merchant' }> =
      {
        type: 'merchant',
        livemode: true,
        organizationId: 'org_123',
        userId: 'user_456',
      }

    const expectedResult = { data: 'test-value', count: 42 }

    const result = await recomputeWithMerchantContext(
      context,
      async () => {
        return expectedResult
      }
    )

    expect(result).toEqual(expectedResult)
  })

  it('propagates errors from callback', async () => {
    const context: Extract<TransactionContext, { type: 'merchant' }> =
      {
        type: 'merchant',
        livemode: true,
        organizationId: 'org_error_test',
        userId: 'user_error_test',
      }

    await expect(
      recomputeWithMerchantContext(context, async () => {
        throw new Error('Callback error for testing')
      })
    ).rejects.toThrow('Callback error for testing')
  })

  it('provides transaction object to callback for database operations', async () => {
    const context: Extract<TransactionContext, { type: 'merchant' }> =
      {
        type: 'merchant',
        livemode: true,
        organizationId: 'org_tx_test',
        userId: 'user_tx_test',
      }

    const result = await recomputeWithMerchantContext(
      context,
      async (transaction) => {
        // Verify we can execute SQL using the transaction
        const rows = await transaction.execute(sql`SELECT 1 as value`)
        const parsed = z
          .object({ value: z.number() })
          .array()
          .parse(rows)
        return parsed[0]?.value
      }
    )

    expect(result).toBe(1)
  })
})

describe('recomputeWithCustomerContext', () => {
  it('sets JWT claims with customer role and customerId', async () => {
    const context: Extract<TransactionContext, { type: 'customer' }> =
      {
        type: 'customer',
        livemode: true,
        organizationId: 'org_customer_test',
        userId: 'user_customer_test',
        customerId: 'cust_12345',
      }

    const result = await recomputeWithCustomerContext(
      context,
      async (transaction) => {
        const claims = await getCurrentJwtClaims(transaction)

        // JWT claims should reflect customer context
        expect(claims?.sub).toBe(context.userId)
        expect(claims?.organization_id).toBe(context.organizationId)
        expect(claims?.role).toBe('customer')
        expect(claims?.auth_type).toBe('webapp')

        return 'customer_success'
      }
    )

    expect(result).toBe('customer_success')
  })

  it('sets livemode configuration correctly for customer context', async () => {
    const context: Extract<TransactionContext, { type: 'customer' }> =
      {
        type: 'customer',
        livemode: false,
        organizationId: 'org_customer_test',
        userId: 'user_customer_test',
        customerId: 'cust_test_mode',
      }

    const livemode = await recomputeWithCustomerContext(
      context,
      async (transaction) => {
        return getCurrentLivemode(transaction)
      }
    )

    expect(livemode).toBe(false)
  })

  it('executes callback and returns its result', async () => {
    const context: Extract<TransactionContext, { type: 'customer' }> =
      {
        type: 'customer',
        livemode: true,
        organizationId: 'org_cust',
        userId: 'user_cust',
        customerId: 'cust_result_test',
      }

    const expectedResult = { invoices: 3, balance: 100.5 }

    const result = await recomputeWithCustomerContext(
      context,
      async () => {
        return expectedResult
      }
    )

    expect(result).toEqual(expectedResult)
  })

  it('propagates errors from callback', async () => {
    const context: Extract<TransactionContext, { type: 'customer' }> =
      {
        type: 'customer',
        livemode: true,
        organizationId: 'org_cust_error',
        userId: 'user_cust_error',
        customerId: 'cust_error_test',
      }

    await expect(
      recomputeWithCustomerContext(context, async () => {
        throw new Error('Customer callback error')
      })
    ).rejects.toThrow('Customer callback error')
  })
})
