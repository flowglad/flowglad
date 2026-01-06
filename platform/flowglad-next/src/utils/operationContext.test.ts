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
    it('sets application_name and app.operation when called within an operation context', async () => {
      await withOperationContext('subscriptions.update', async () => {
        await db.transaction(async (transaction) => {
          await setTransactionOperationLabel(transaction)

          // Check app.operation config
          const configResult = (await transaction.execute(
            sql`SELECT current_setting('app.operation', true) as current_setting`
          )) as unknown as { current_setting: string }[]
          expect(configResult[0].current_setting).toBe(
            'subscriptions.update'
          )

          // Check application_name (used for pg_stat_activity visibility)
          const appNameResult = (await transaction.execute(
            sql`SELECT current_setting('application_name') as app_name`
          )) as unknown as { app_name: string }[]
          expect(appNameResult[0].app_name).toBe(
            'flowglad:subscriptions.update'
          )
        })
      })
    })

    it('does not set labels when called outside of an operation context', async () => {
      await db.transaction(async (transaction) => {
        // Store original application_name before calling setTransactionOperationLabel
        const beforeResult = (await transaction.execute(
          sql`SELECT current_setting('application_name') as app_name`
        )) as unknown as { app_name: string }[]
        const originalAppName = beforeResult[0].app_name

        await setTransactionOperationLabel(transaction)

        // app.operation should be empty/null
        const configResult = (await transaction.execute(
          sql`SELECT current_setting('app.operation', true) as current_setting`
        )) as unknown as { current_setting: string | null }[]
        // PostgreSQL returns null or empty string when the setting doesn't exist
        expect(
          configResult[0].current_setting === null ||
            configResult[0].current_setting === ''
        ).toBe(true)

        // application_name should be unchanged
        const afterResult = (await transaction.execute(
          sql`SELECT current_setting('application_name') as app_name`
        )) as unknown as { app_name: string }[]
        expect(afterResult[0].app_name).toBe(originalAppName)
      })
    })
  })
})
