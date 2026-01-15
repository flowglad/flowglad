import { describe, expect, it, vi } from 'vitest'
import {
  doResult,
  err,
  isErr,
  isOk,
  ok,
  unwrapOrThrow,
} from './result'

describe('Result monad utilities', () => {
  describe('ok', () => {
    it('creates a success result containing the provided value', () => {
      const result = ok(42)
      expect(result).toEqual({ result: 42 })
    })

    it('creates a success result with complex objects', () => {
      const value = { name: 'test', items: [1, 2, 3] }
      const result = ok(value)
      expect(result).toEqual({ result: value })
    })

    it('creates a success result with null value', () => {
      const result = ok(null)
      expect(result).toEqual({ result: null })
    })

    it('creates a success result with undefined value', () => {
      const result = ok(undefined)
      expect(result).toEqual({ result: undefined })
    })
  })

  describe('err', () => {
    it('creates a failure result containing the provided error', () => {
      const error = new Error('something went wrong')
      const result = err(error)
      expect(result).toEqual({ error })
    })

    it('creates a failure result with custom error types', () => {
      const customError = {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      }
      const result = err(customError)
      expect(result).toEqual({ error: customError })
    })

    it('creates a failure result with string error', () => {
      const result = err('simple error message')
      expect(result).toEqual({ error: 'simple error message' })
    })
  })

  describe('isOk', () => {
    it('returns true for success results', () => {
      expect(isOk(ok(42))).toBe(true)
      expect(isOk(ok(null))).toBe(true)
      expect(isOk(ok({ data: 'test' }))).toBe(true)
    })

    it('returns false for failure results', () => {
      expect(isOk(err(new Error('fail')))).toBe(false)
      expect(isOk(err('error'))).toBe(false)
    })

    it('narrows the type correctly for success results', () => {
      const result = ok(42) as
        | ReturnType<typeof ok<number>>
        | ReturnType<typeof err<Error>>
      if (isOk(result)) {
        // TypeScript should know result.result is number here
        const value: number = result.result
        expect(value).toBe(42)
      }
    })
  })

  describe('isErr', () => {
    it('returns true for failure results', () => {
      expect(isErr(err(new Error('fail')))).toBe(true)
      expect(isErr(err('error'))).toBe(true)
      expect(isErr(err({ code: 500 }))).toBe(true)
    })

    it('returns false for success results', () => {
      expect(isErr(ok(42))).toBe(false)
      expect(isErr(ok(null))).toBe(false)
    })

    it('narrows the type correctly for failure results', () => {
      const result = err(new Error('test')) as
        | ReturnType<typeof ok<number>>
        | ReturnType<typeof err<Error>>
      if (isErr(result)) {
        // TypeScript should know result.error is Error here
        const error: Error = result.error
        expect(error.message).toBe('test')
      }
    })
  })

  describe('doResult', () => {
    it('chains successful operations and returns final result', async () => {
      const add10 = (n: number) => ok(n + 10)
      const multiply2 = (n: number) => ok(n * 2)
      const toString = (n: number) => ok(`Result: ${n}`)

      const result = await doResult(ok(5), add10, multiply2, toString)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.result).toBe('Result: 30') // (5 + 10) * 2 = 30
      }
    })

    it('short-circuits on first error and returns that error', async () => {
      const add10 = (n: number) => ok(n + 10)
      const failIfOver20 = (n: number) =>
        n > 20 ? err(new Error('Value too large')) : ok(n)
      const multiply2 = (n: number) => ok(n * 2)

      const result = await doResult(
        ok(15),
        add10,
        failIfOver20,
        multiply2
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error.message).toBe('Value too large')
      }
    })

    it('returns initial error without calling any functions', async () => {
      const neverCalled = vi.fn(() => ok('should not be called'))

      const result = await doResult(
        err(new Error('initial error')),
        neverCalled
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error.message).toBe('initial error')
      }
      expect(neverCalled).not.toHaveBeenCalled()
    })

    it('works with async functions', async () => {
      const asyncAdd = async (n: number) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return ok(n + 5)
      }
      const asyncMultiply = async (n: number) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return ok(n * 3)
      }

      const result = await doResult(ok(10), asyncAdd, asyncMultiply)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.result).toBe(45) // (10 + 5) * 3 = 45
      }
    })

    it('works with mixed sync and async functions', async () => {
      const syncAdd = (n: number) => ok(n + 1)
      const asyncMultiply = async (n: number) => ok(n * 2)

      const result = await doResult(
        ok(5),
        syncAdd,
        asyncMultiply,
        syncAdd
      )

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.result).toBe(13) // ((5 + 1) * 2) + 1 = 13
      }
    })

    it('works with Promise initial value', async () => {
      const asyncInitial = Promise.resolve(ok(100))
      const subtract50 = (n: number) => ok(n - 50)

      const result = await doResult(asyncInitial, subtract50)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.result).toBe(50)
      }
    })

    it('handles no functions (returns initial value)', async () => {
      const result = await doResult(ok('just the initial'))

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.result).toBe('just the initial')
      }
    })

    it('propagates context through the chain', async () => {
      type Context = { value: number; history: string[] }

      const step1 = (ctx: Context) =>
        ok({
          value: ctx.value + 10,
          history: [...ctx.history, 'added 10'],
        })

      const step2 = (ctx: Context) =>
        ok({
          value: ctx.value * 2,
          history: [...ctx.history, 'multiplied by 2'],
        })

      const result = await doResult(
        ok({ value: 5, history: ['start'] }),
        step1,
        step2
      )

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.result.value).toBe(30)
        expect(result.result.history).toEqual([
          'start',
          'added 10',
          'multiplied by 2',
        ])
      }
    })
  })

  describe('unwrapOrThrow', () => {
    it('returns the value for success results', () => {
      const value = unwrapOrThrow(ok(42))
      expect(value).toBe(42)
    })

    it('returns complex objects for success results', () => {
      const data = { name: 'test', count: 5 }
      const value = unwrapOrThrow(ok(data))
      expect(value).toEqual(data)
    })

    it('throws the error for failure results', () => {
      const error = new Error('something failed')
      expect(() => unwrapOrThrow(err(error))).toThrow(
        'something failed'
      )
    })

    it('throws the exact error object provided', () => {
      const error = new Error('exact error')
      try {
        unwrapOrThrow(err(error))
        expect.fail('should have thrown')
      } catch (e) {
        expect(e).toBe(error) // Same reference
      }
    })

    it('works with custom error classes', () => {
      class CustomError extends Error {
        constructor(
          public code: string,
          message: string
        ) {
          super(message)
          this.name = 'CustomError'
        }
      }

      const customError = new CustomError('E001', 'Custom failure')
      expect(() => unwrapOrThrow(err(customError))).toThrow(
        CustomError
      )
    })
  })
})
