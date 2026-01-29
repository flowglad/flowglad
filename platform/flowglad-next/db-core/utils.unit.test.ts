import { describe, expect, it } from 'bun:test'
import core, {
  createInvoiceNumberBase,
  createSafeZodEnum,
  generateRandomBytes,
  gitCommitId,
  IS_DEV,
  IS_TEST,
  nanoid,
  safeZodNonNegativeInteger,
  safeZodNullOrUndefined,
  safeZodSanitizedString,
  zodOptionalNullableString,
} from './utils'

describe('db-core/utils', () => {
  describe('environment detection', () => {
    it('IS_TEST is a boolean reflecting test environment', () => {
      expect(typeof IS_TEST).toBe('boolean')
      // In test environment, this should be true
      expect(IS_TEST).toBe(true)
    })

    it('IS_DEV is a boolean reflecting development environment', () => {
      expect(typeof IS_DEV).toBe('boolean')
    })
  })

  describe('nanoid', () => {
    it('generates a 21-character alphanumeric string', () => {
      const id = nanoid()
      expect(id).toHaveLength(21)
      expect(id).toMatch(/^[0-9A-Za-z]+$/)
    })

    it('generates unique IDs on each call', () => {
      const ids = new Set(Array.from({ length: 100 }, () => nanoid()))
      expect(ids.size).toBe(100)
    })
  })

  describe('createInvoiceNumberBase', () => {
    it('generates a 7-character string from hex-like alphabet (ABCDEF0123456789)', () => {
      const invoiceBase = createInvoiceNumberBase()
      expect(invoiceBase).toHaveLength(7)
      expect(invoiceBase).toMatch(/^[ABCDEF0-9]+$/)
    })

    it('generates unique values on each call', () => {
      const bases = new Set(
        Array.from({ length: 100 }, () => createInvoiceNumberBase())
      )
      expect(bases.size).toBe(100)
    })
  })

  describe('generateRandomBytes', () => {
    it('generates a hex string of the specified byte length (doubled for hex encoding)', () => {
      const bytes16 = generateRandomBytes(16)
      expect(bytes16).toHaveLength(32) // 16 bytes = 32 hex chars
      expect(bytes16).toMatch(/^[0-9a-f]+$/)

      const bytes32 = generateRandomBytes(32)
      expect(bytes32).toHaveLength(64) // 32 bytes = 64 hex chars
      expect(bytes32).toMatch(/^[0-9a-f]+$/)
    })

    it('generates unique values on each call', () => {
      const values = new Set(
        Array.from({ length: 100 }, () => generateRandomBytes(16))
      )
      expect(values.size).toBe(100)
    })
  })

  describe('safeZodNonNegativeInteger', () => {
    it('accepts positive integers', () => {
      const result = safeZodNonNegativeInteger.safeParse(42)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(42)
      }
    })

    it('accepts zero', () => {
      const result = safeZodNonNegativeInteger.safeParse(0)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    it('coerces numeric strings to integers', () => {
      const result = safeZodNonNegativeInteger.safeParse('123')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(123)
      }
    })

    it('rejects negative numbers', () => {
      const result = safeZodNonNegativeInteger.safeParse(-1)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Value must be a non-negative integer'
        )
      }
    })

    it('rejects floating point numbers', () => {
      const result = safeZodNonNegativeInteger.safeParse(3.14)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Value must be a non-negative integer'
        )
      }
    })
  })

  describe('zodOptionalNullableString', () => {
    it('accepts a string', () => {
      const result = zodOptionalNullableString.safeParse('hello')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('hello')
      }
    })

    it('accepts null', () => {
      const result = zodOptionalNullableString.safeParse(null)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(null)
      }
    })

    it('accepts undefined', () => {
      const result = zodOptionalNullableString.safeParse(undefined)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(undefined)
      }
    })

    it('rejects non-string values', () => {
      const result = zodOptionalNullableString.safeParse(123)
      expect(result.success).toBe(false)
    })
  })

  describe('safeZodNullOrUndefined', () => {
    it('returns null for null input', () => {
      const result = safeZodNullOrUndefined.parse(null)
      expect(result).toBe(null)
    })

    it('returns null for undefined input', () => {
      const result = safeZodNullOrUndefined.parse(undefined)
      expect(result).toBe(null)
    })

    it('rejects non-null/undefined values', () => {
      const result = safeZodNullOrUndefined.safeParse('string')
      expect(result.success).toBe(false)
    })
  })

  describe('safeZodSanitizedString', () => {
    it('accepts valid strings', () => {
      const result = safeZodSanitizedString.safeParse('valid string')
      expect(result.success).toBe(true)
    })

    it('rejects empty strings', () => {
      const result = safeZodSanitizedString.safeParse('')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Field is required'
        )
      }
    })

    it('rejects whitespace-only strings after trimming', () => {
      const result = safeZodSanitizedString.safeParse('   ')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Field is required'
        )
      }
    })

    it('rejects strings exceeding 255 characters', () => {
      const longString = 'a'.repeat(256)
      const result = safeZodSanitizedString.safeParse(longString)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Field must be less than 255 characters'
        )
      }
    })

    it('trims leading and trailing whitespace', () => {
      const result =
        safeZodSanitizedString.safeParse('  hello world  ')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('hello world')
      }
    })
  })

  describe('createSafeZodEnum', () => {
    it('creates a zod schema that validates enum values', () => {
      enum TestEnum {
        A = 'a',
        B = 'b',
        C = 'c',
      }
      const schema = createSafeZodEnum(TestEnum)

      expect(schema.safeParse('a').success).toBe(true)
      expect(schema.safeParse('b').success).toBe(true)
      expect(schema.safeParse('c').success).toBe(true)
      expect(schema.safeParse('d').success).toBe(false)
    })

    it('works with numeric enums', () => {
      enum NumericEnum {
        One = 1,
        Two = 2,
        Three = 3,
      }
      const schema = createSafeZodEnum(NumericEnum)

      expect(schema.safeParse(1).success).toBe(true)
      expect(schema.safeParse(2).success).toBe(true)
      expect(schema.safeParse(4).success).toBe(false)
    })
  })

  describe('gitCommitId', () => {
    it('returns a string', () => {
      const commitId = gitCommitId()
      expect(typeof commitId).toBe('string')
    })

    it('returns __TEST__ in test environment when no CI env vars are set', () => {
      // In test environment without CI env vars, should return __TEST__
      const originalVercel = process.env.VERCEL_GIT_COMMIT_SHA
      const originalGithub = process.env.GITHUB_SHA
      const originalCI = process.env.CI_COMMIT_SHA

      delete process.env.VERCEL_GIT_COMMIT_SHA
      delete process.env.GITHUB_SHA
      delete process.env.CI_COMMIT_SHA

      const commitId = gitCommitId()
      // Since IS_TEST is true in test environment, should return __TEST__
      expect(commitId).toBe('__TEST__')

      // Restore
      if (originalVercel)
        process.env.VERCEL_GIT_COMMIT_SHA = originalVercel
      if (originalGithub) process.env.GITHUB_SHA = originalGithub
      if (originalCI) process.env.CI_COMMIT_SHA = originalCI
    })

    it('returns VERCEL_GIT_COMMIT_SHA when set', () => {
      const original = process.env.VERCEL_GIT_COMMIT_SHA
      process.env.VERCEL_GIT_COMMIT_SHA = 'abc123vercel'

      const commitId = gitCommitId()
      expect(commitId).toBe('abc123vercel')

      if (original) {
        process.env.VERCEL_GIT_COMMIT_SHA = original
      } else {
        delete process.env.VERCEL_GIT_COMMIT_SHA
      }
    })

    it('falls back to GITHUB_SHA when VERCEL_GIT_COMMIT_SHA is not set', () => {
      const originalVercel = process.env.VERCEL_GIT_COMMIT_SHA
      const originalGithub = process.env.GITHUB_SHA

      delete process.env.VERCEL_GIT_COMMIT_SHA
      process.env.GITHUB_SHA = 'abc123github'

      const commitId = gitCommitId()
      expect(commitId).toBe('abc123github')

      if (originalVercel)
        process.env.VERCEL_GIT_COMMIT_SHA = originalVercel
      if (originalGithub) {
        process.env.GITHUB_SHA = originalGithub
      } else {
        delete process.env.GITHUB_SHA
      }
    })
  })

  describe('default export (core object)', () => {
    it('exports all utilities as named properties', () => {
      expect(core.IS_TEST).toBe(IS_TEST)
      expect(core.IS_DEV).toBe(IS_DEV)
      expect(core.nanoid).toBe(nanoid)
      expect(core.createSafeZodEnum).toBe(createSafeZodEnum)
      expect(core.safeZodNonNegativeInteger).toBe(
        safeZodNonNegativeInteger
      )
      expect(core.safeZodNullOrUndefined).toBe(safeZodNullOrUndefined)
      expect(core.safeZodSanitizedString).toBe(safeZodSanitizedString)
      expect(core.zodOptionalNullableString).toBe(
        zodOptionalNullableString
      )
      expect(core.gitCommitId).toBe(gitCommitId)
      expect(core.createInvoiceNumberBase).toBe(
        createInvoiceNumberBase
      )
      expect(core.generateRandomBytes).toBe(generateRandomBytes)
    })
  })
})
