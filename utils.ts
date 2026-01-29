// db-core/utils.ts - MINIMAL version for schemas only

import crypto from 'crypto'
import { customAlphabet } from 'nanoid'
import { z } from 'zod'

// Environment detection
export const IS_TEST =
  (process.env.NODE_ENV === 'test' ||
    process.env.FORCE_TEST_MODE === 'true') &&
  process.env.VERCEL_ENV !== 'production'

export const IS_DEV =
  process.env.NEXT_PUBLIC_IS_PROD !== 'true' &&
  process.env.NODE_ENV === 'development'

// ID generation
export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  21
)

export const createInvoiceNumberBase = customAlphabet(
  'ABCDEF0123456789',
  7
)

export const generateRandomBytes = (length: number): string => {
  return crypto.randomBytes(length).toString('hex')
}

// Zod helpers used by schema files
export const safeZodNonNegativeInteger = z.coerce
  .number()
  .transform((str) => Number(str))
  .refine(
    (arg) =>
      z.coerce.number().int().nonnegative().safeParse(arg).success,
    { message: 'Value must be a non-negative integer' }
  )

export const zodOptionalNullableString = z
  .string()
  .nullable()
  .optional()

export const safeZodNullOrUndefined = z
  .null()
  .optional()
  .transform(() => null)
  .pipe(z.null())
  .describe('Omitted.')

export const safeZodSanitizedString = z
  .string()
  .trim()
  .min(1, 'Field is required')
  .max(255, 'Field must be less than 255 characters')

export const createSafeZodEnum = <
  T extends Record<string, string | number>,
>(
  enumType: T
) => {
  // Use z.enum for TS enums in Zod v4 (nativeEnum is deprecated)
  return z.enum(enumType)
}

// Git commit ID - fallback-safe for different CI environments
export const gitCommitId = (): string => {
  const commitId =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.CI_COMMIT_SHA
  if (IS_DEV && !commitId) return '__DEV__'
  if (IS_TEST && !commitId) return '__TEST__'
  return commitId || 'unknown'
}

// Default export mimicking core's interface for schema files
const core = {
  IS_TEST,
  IS_DEV,
  nanoid,
  createSafeZodEnum,
  safeZodNonNegativeInteger,
  safeZodNullOrUndefined,
  safeZodSanitizedString,
  zodOptionalNullableString,
  gitCommitId,
  createInvoiceNumberBase,
  generateRandomBytes,
}

export default core
