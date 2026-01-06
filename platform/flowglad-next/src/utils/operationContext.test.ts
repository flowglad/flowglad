import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db/client'
import {
  getCurrentOperationName,
  setTransactionOperationLabel,
  withOperationContext,
} from './operationContext'

describe('operationContext', () => {
  describe('withOperationContext and getCurrentOperationName', () => {
    it('returns undefined when called outside of an operation context', () => {
      expect(getCurrentOperationName()).toBeUndefined()
    })

    it('returns the operation name when called within an operation context', () => {
      const result = withOperationContext('customers.create', () => {
        return getCurrentOperationName()
      })
      expect(result).toBe('customers.create')
    })

    it('returns undefined after exiting the operation context', () => {
      withOperationContext('customers.create', () => {
        // Inside context
      })
      expect(getCurrentOperationName()).toBeUndefined()
    })

    it('supports nested contexts where the innermost context takes precedence', () => {
      const results: (string | undefined)[] = []

      withOperationContext('outer.operation', () => {
        results.push(getCurrentOperationName())

        withOperationContext('inner.operation', () => {
          results.push(getCurrentOperationName())
        })

        results.push(getCurrentOperationName())
      })

      expect(results).toEqual([
        'outer.operation',
        'inner.operation',
        'outer.operation',
      ])
    })

    it('propagates context through async operations', async () => {
      const result = await withOperationContext(
        'async.operation',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return getCurrentOperationName()
        }
      )
      expect(result).toBe('async.operation')
    })
  })

  describe('setTransactionOperationLabel', () => {
    it('sets app.operation config when called within an operation context', async () => {
      await withOperationContext('subscriptions.update', async () => {
        await db.transaction(async (transaction) => {
          await setTransactionOperationLabel(transaction)

          const result = (await transaction.execute(
            sql`SELECT current_setting('app.operation', true) as current_setting`
          )) as unknown as { current_setting: string }[]
          expect(result[0].current_setting).toBe(
            'subscriptions.update'
          )
        })
      })
    })

    it('does not set app.operation when called outside of an operation context', async () => {
      await db.transaction(async (transaction) => {
        await setTransactionOperationLabel(transaction)

        const result = (await transaction.execute(
          sql`SELECT current_setting('app.operation', true) as current_setting`
        )) as unknown as { current_setting: string | null }[]
        // PostgreSQL returns empty string when the setting doesn't exist (with true flag)
        expect(result[0].current_setting).toBe('')
      })
    })
  })
})
