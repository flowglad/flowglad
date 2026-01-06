import { describe, expect, it } from 'vitest'
import {
  getCurrentOperationName,
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
})
