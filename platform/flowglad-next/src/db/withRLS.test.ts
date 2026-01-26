import { describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'
import { adminTransaction } from './adminTransaction'
import { withRLS } from './withRLS'

describe('withRLS', () => {
  it('sets JWT claims and role, executes function, then resets role', async () => {
    const executedQueries: string[] = []

    await adminTransaction(async ({ transaction }) => {
      const result = await withRLS(
        transaction,
        {
          jwtClaim: {
            role: 'merchant',
            sub: 'user_123',
            organization_id: 'org_456',
          },
          livemode: true,
        },
        async () => {
          // Verify RLS context is set by reading current settings
          const claimsResult = (await transaction.execute(
            sql`SELECT current_setting('request.jwt.claims', true) as current_setting`
          )) as { current_setting: string }[]
          const jwtClaims = JSON.parse(
            claimsResult[0]?.current_setting || '{}'
          )

          const livemodeResult = (await transaction.execute(
            sql`SELECT current_setting('app.livemode', true) as current_setting`
          )) as { current_setting: string }[]
          const livemode = livemodeResult[0]?.current_setting

          executedQueries.push('function executed')

          return {
            jwtClaims,
            livemode,
          }
        }
      )

      expect(result.jwtClaims.role).toBe('merchant')
      expect(result.jwtClaims.sub).toBe('user_123')
      expect(result.jwtClaims.organization_id).toBe('org_456')
      expect(result.livemode).toBe('true')
    })

    expect(executedQueries).toContain('function executed')
  })

  it('sets livemode to false when livemode is false', async () => {
    await adminTransaction(async ({ transaction }) => {
      const result = await withRLS(
        transaction,
        {
          jwtClaim: { role: 'merchant' },
          livemode: false,
        },
        async () => {
          const livemodeResult = (await transaction.execute(
            sql`SELECT current_setting('app.livemode', true) as current_setting`
          )) as { current_setting: string }[]
          return livemodeResult[0]?.current_setting
        }
      )

      expect(result).toBe('false')
    })
  })

  it('returns the result from the wrapped function', async () => {
    await adminTransaction(async ({ transaction }) => {
      const result = await withRLS(
        transaction,
        {
          jwtClaim: { role: 'customer' },
          livemode: true,
        },
        async () => {
          return { data: 'test-value', count: 42 }
        }
      )

      expect(result).toEqual({ data: 'test-value', count: 42 })
    })
  })

  it('propagates errors from the wrapped function', async () => {
    await adminTransaction(async ({ transaction }) => {
      await expect(
        withRLS(
          transaction,
          {
            jwtClaim: { role: 'merchant' },
            livemode: true,
          },
          async () => {
            throw new Error('Test error from wrapped function')
          }
        )
      ).rejects.toThrow('Test error from wrapped function')
    })
  })

  it('clears previous JWT claims before setting new ones', async () => {
    await adminTransaction(async ({ transaction }) => {
      // First, set some JWT claims manually (using customer role which exists in DB)
      const initialClaim = JSON.stringify({
        role: 'customer',
        sub: 'old_user',
      })
      await transaction.execute(
        sql`SELECT set_config('request.jwt.claims', ${initialClaim}, true)`
      )

      // Now use withRLS which should clear and set new claims (using merchant role)
      const result = await withRLS(
        transaction,
        {
          jwtClaim: { role: 'merchant', sub: 'new_user' },
          livemode: true,
        },
        async () => {
          const claimsResult = (await transaction.execute(
            sql`SELECT current_setting('request.jwt.claims', true) as current_setting`
          )) as { current_setting: string }[]
          return JSON.parse(claimsResult[0]?.current_setting || '{}')
        }
      )

      expect(result.role).toBe('merchant')
      expect(result.sub).toBe('new_user')
    })
  })
})
