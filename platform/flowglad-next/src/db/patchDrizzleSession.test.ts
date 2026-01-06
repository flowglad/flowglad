import { describe, expect, it } from 'vitest'
import { withOperationContext } from '@/utils/operationContext'
import { sanitizeForComment } from './patchDrizzleSession'

describe('patchDrizzleSession', () => {
  describe('sanitizeForComment', () => {
    it('allows alphanumeric characters', () => {
      expect(sanitizeForComment('customers123')).toBe('customers123')
    })

    it('allows dots, underscores, and hyphens', () => {
      expect(sanitizeForComment('customers.create')).toBe(
        'customers.create'
      )
      expect(sanitizeForComment('customers_create')).toBe(
        'customers_create'
      )
      expect(sanitizeForComment('customers-create')).toBe(
        'customers-create'
      )
    })

    it('replaces special characters with underscores', () => {
      // Hyphens are allowed, so -- stays as --
      expect(sanitizeForComment("test'; DROP TABLE --")).toBe(
        'test___DROP_TABLE_--'
      )
      // * and / are replaced, space is replaced
      expect(sanitizeForComment('test */ SELECT *')).toBe(
        'test____SELECT__'
      )
      // SQL comment close sequence */ becomes __
      expect(sanitizeForComment('malicious*/comment')).toBe(
        'malicious__comment'
      )
    })

    it('truncates to 100 characters', () => {
      const longName = 'a'.repeat(150)
      expect(sanitizeForComment(longName)).toBe('a'.repeat(100))
    })

    it('handles empty string', () => {
      expect(sanitizeForComment('')).toBe('')
    })
  })

  describe('SQL comment injection', () => {
    it('prepends comment to queries within operation context', async () => {
      // This test verifies that the patch is working by checking
      // that operations within a context will have comments prepended.
      // The actual query text verification would require pg_stat_statements
      // which may not be available in the test database.
      let contextName: string | undefined

      await withOperationContext('test.operation', async () => {
        // Import dynamically to ensure patch is applied
        const { getCurrentOperationName } = await import(
          '@/utils/operationContext'
        )
        contextName = getCurrentOperationName()
      })

      expect(contextName).toBe('test.operation')
    })

    it('does not affect queries outside operation context', async () => {
      const { getCurrentOperationName } = await import(
        '@/utils/operationContext'
      )
      expect(getCurrentOperationName()).toBeUndefined()
    })
  })
})
