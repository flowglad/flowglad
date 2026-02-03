import { CountryCode, CurrencyCode } from '@db-core/enums'
import * as Sentry from '@sentry/nextjs'
import axios, { type AxiosRequestConfig } from 'axios'
import { camelCase, sentenceCase } from 'change-case'
import {
  format,
  setHours,
  setMilliseconds,
  setMinutes,
  setSeconds,
  startOfMonth,
} from 'date-fns'
import { customAlphabet } from 'nanoid'
import has from 'ramda/src/has'
import omit from 'ramda/src/omit'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { type Nullish, StripePriceMode } from '@/types'
import latinMap from './latinMap'

export const envVariable = (key: string) => process.env[key] || ''

//This would make self hosting more complicated to implement, we currently only use stripping user suffix from env vars on vercel:env-pull post processing step.
// export const localizedEnvVariable = (key: string) =>
//   envVariable(`${envVariable('LOCAL_USER')}_${key}`)

export const safeUrl = (path: string, urlBase: string) => {
  const protocol = urlBase.match('localhost') ? 'http' : 'https'
  const isFlowgladPreviewURL =
    urlBase.endsWith('-flowglad.vercel.app') ||
    urlBase.endsWith('staging.flowglad.com')

  const vercelDeploymentProtectionByPass = isFlowgladPreviewURL
    ? core.envVariable('DEPLOYMENT_PROTECTION_BYPASS_SECRET')
    : undefined
  const url = new URL(
    path,
    /**
     * 1. Safely strip the protocol from the URL base to avoid double protocols
     * 2. Use the proper protocol based on whether or
     *      not it's localhost (which only supports http)
     */
    `${protocol}://${urlBase.replace(/.*\/\//g, '')}`
  )
  if (isFlowgladPreviewURL && vercelDeploymentProtectionByPass) {
    url.searchParams.set(
      'x-vercel-protection-bypass',
      vercelDeploymentProtectionByPass
    )
  }
  return url.href
}

export const notEmptyOrNil = (value: string | unknown[]) =>
  !isNil(value) && value.length !== 0

export const middlewareFetch = async (
  url: string,
  options: RequestInit
) => {
  // eslint-disable-next-line no-console
  console.log('requesting:', {
    url,
    options,
  })
  const resp = await fetch(url, options)
  const respJson = await resp.json()
  // eslint-disable-next-line no-console
  console.log(
    `request\n: ${url}, ${JSON.stringify(options)}`,
    '\nresponse:',
    respJson
  )
  return respJson
}

export const post = async (
  url: string,
  data: object,
  config?: AxiosRequestConfig
) => {
  // eslint-disable-next-line no-console
  console.log('requesting:', {
    url,
    data: JSON.stringify(data),
    config,
  })
  const resp = await axios.post(url, data, config)
  // eslint-disable-next-line no-console
  console.log(
    `request\n: ${url}, ${JSON.stringify(data)}`,
    '\nresponse:',
    resp.data
  )
  return resp.data
}

export const firstDotLastFromName = (nameToSplit: string) => {
  /**
   * - Decompose diacritic characters and graphemes into multiple characters
   * - Replace special characters with ASCII latin equivalents
   * - Strip out isolated accent characters
   * - Split name into first and last
   * Solution based on:
   * - https://stackoverflow.com/a/9667817
   * - https://stackoverflow.com/a/37511463
   */
  const [firstName, lastName] = nameToSplit
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\] ]/g, (character) => {
      return latinMap[character as keyof typeof latinMap] || ''
    })
    .split(' ')
  /**
   * Convert to UTF-8
   */
  const firstDotLast = `${firstName}.${lastName.replaceAll(
    /[\W_]+/g,
    ''
  )}`.toLocaleLowerCase()
  return {
    firstName,
    lastName,
    firstDotLast,
  }
}

export const sliceIntoChunks = <T>(arr: T[], chunkSize: number) =>
  Array.from({ length: Math.ceil(arr.length / chunkSize) }, (_, i) =>
    arr.slice(i * chunkSize, (i + 1) * chunkSize)
  )

/**
 * Hydration-safe production flag.
 *
 * Uses ONLY `NEXT_PUBLIC_IS_PROD` because:
 * - `NEXT_PUBLIC_*` vars are inlined at build time, identical on server and client
 * - `VERCEL_ENV` is server-only (undefined on client), causing hydration mismatches
 *
 * IMPORTANT: Ensure `NEXT_PUBLIC_IS_PROD=true` is set in production environments.
 * Without this, IS_PROD will be `false` even in production deployments.
 */
export const IS_PROD = process.env.NEXT_PUBLIC_IS_PROD === 'true'
export const IS_TEST =
  (process.env.NODE_ENV === 'test' || process.env.FORCE_TEST_MODE) &&
  process.env.VERCEL_ENV !== 'production'

/**
 * Local playground mode flag.
 *
 * When enabled, the platform validates API keys against the local database
 * instead of calling Unkey. This allows playground projects to work with
 * locally-seeded API keys.
 *
 * Set FLOWGLAD_LOCAL_PLAYGROUND=true to enable.
 */
export const IS_LOCAL_PLAYGROUND =
  process.env.FLOWGLAD_LOCAL_PLAYGROUND === 'true'

/**
 * Test database URL used by both local docker-compose and CI service containers.
 * Both environments provide PostgreSQL at localhost:5432 with identical credentials.
 * Can be overridden via TEST_DB_URL environment variable for playground development.
 */
export const TEST_DB_URL =
  process.env.TEST_DB_URL ||
  'postgresql://test:test@localhost:5432/test_db'
export const IS_DEV =
  !IS_PROD && process.env.NODE_ENV === 'development'

/**
 * Used to prefix notifications sent in the dev environment,
 * otherwise an empty string
 */
export const DEV_ENVIRONMENT_NOTIF_PREFIX = IS_PROD ? '' : '__DEV__: '

interface EnvironmentSafeContactListParams {
  prodContacts: string[]
  stagingContacts: string[]
}

export const safeContactList = (
  params: EnvironmentSafeContactListParams
) => {
  const { prodContacts, stagingContacts } = params
  if (IS_PROD) {
    return params.prodContacts
  }
  // eslint-disable-next-line no-console
  console.log(`safeContactList: would have sent to ${prodContacts}`)
  return stagingContacts
}

export const formatDate = (
  date: Date | string | number,
  includeTime?: boolean
) =>
  format(
    /**
     * Slightly gross - we are defensively re-instantiating the date object
     * here because sometimes (e.g. when working with dates returned by trigger.dev tasks, which are returned as JSON strings)
     * we need to re-instantiate the date object to avoid getting a "date is not valid" error
     */
    new Date(date),
    'MMM d, yyyy' + (includeTime ? ' h:mm a' : '')
  )

// If dates are in the same year, omit year from first date to avoid redundancy
// e.g. "Jan 1 - Dec 31, 2024" instead of "Jan 1, 2024 - Dec 31, 2024"
export const formatDateRange = ({
  fromDate,
  toDate,
}: {
  fromDate: Date
  toDate: Date
}) => {
  let formattedFromDate = formatDate(fromDate)
  const formattedToDate = formatDate(toDate)
  if (fromDate.getFullYear() === toDate.getFullYear()) {
    formattedFromDate = formattedFromDate.split(',')[0]
  }
  return `${formattedFromDate} - ${formattedToDate}`
}

export const log = Sentry.captureMessage

export const error = IS_PROD ? Sentry.captureException : console.error

export const noOp = () => {}

export const isNil = (value: unknown): value is null | undefined =>
  value == null || value === undefined

export const groupBy = <T>(
  keyGen: (value: T) => string,
  arr: T[]
): { [k: string]: T[] } => {
  const result: { [k: string]: T[] } = {}
  arr.forEach((value) => {
    const key = keyGen(value)
    if (result[key]) {
      result[key] = [...result[key], value]
    } else {
      result[key] = [value]
    }
  })
  return result
}

export const chunkArray = <T>(arr: T[], chunkSize: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / chunkSize) }, (_, i) =>
    arr.slice(i * chunkSize, (i + 1) * chunkSize)
  )

/**
 * Used to generate cache keys for trigger.dev events created dynamically
 * from arrays
 * @param keyBase
 * @param index
 * @returns
 */
export const generateCacheKeys = (keyBase: string, index: number) =>
  `${keyBase}-${index}`

export const dotProduct = (vecA: number[], vecB: number[]) => {
  return vecA.reduce((acc, curr, idx) => acc + curr * vecB[idx], 0)
}

export const magnitude = (vec: number[]) => {
  return Math.sqrt(vec.reduce((acc, curr) => acc + curr * curr, 0))
}

export const cosineSimilarity = (vecA: number[], vecB: number[]) => {
  if (vecA.length !== vecB.length) {
    throw new Error(
      `Vectors must be of the same length. Recevied: vecA: ${vecA.length} and vecB: ${vecB.length}`
    )
  }

  return dotProduct(vecA, vecB) / (magnitude(vecA) * magnitude(vecB))
}
/**
 * Used because primary keys in DBs come back as strings,
 * while foreign keys come back as integers,
 * so strict equality doesn't work without first casting to
 * numbers
 * @param a
 * @param b
 * @returns
 */
export const areDatabaseIdsEqual = (
  a: Nullish<number | string>,
  b: Nullish<number | string>
) => {
  return Number(a) === Number(b)
}

export const devPrefixString = (str: string) => {
  return IS_PROD ? str : `${DEV_ENVIRONMENT_NOTIF_PREFIX}${str}`
}

interface ConstructMidnightDateParams {
  year: number
  month: number
  day: number
}

/**
 * Returns a date object for the given year, month, and day
 * at 23:59:59
 * @param params
 * @returns
 */
export const constructMidnightDate = ({
  year,
  month,
  day,
}: ConstructMidnightDateParams) => {
  return new Date(year, month, day, 23, 59, 59)
}

export const emailAddressToCompanyDomain = (email: string) => {
  /**
   * If email domain is a popular consumer email provider,
   * use the email full email address the company domain.
   */
  const rawCompanyDomain = email.split('@')[1]
  if (
    /gmail\.com|yahoo\.com|outlook\.com|aol\.com/.test(
      rawCompanyDomain
    )
  ) {
    return email
  }
  return rawCompanyDomain
}

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
  .transform(() => {
    return null
  })
  .pipe(z.null())
  .describe('Omitted.')

export const safeZodNullishString = z
  .string()
  .nullish()
  .transform((val) => val ?? null)
  .describe('safeZodNullishString')

export const safeZodDate = z.coerce.date().describe('safeZodDate')

export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  21
)

type EnumValues<T> = T extends Record<string, infer U> ? U : never

export const createSafeZodEnum = <
  T extends Record<string, string | number>,
>(
  enumType: T
) => {
  // Use z.enum for TS enums in Zod v4 (nativeEnum is deprecated)
  return z.enum(enumType)
}

/**
 * Stripe denominates their payments in pennies for USD rather than dollars
 * @param amount
 * @returns the amount in dollars
 */
export const amountInDollars = (amount: number) =>
  Math.floor(amount / 100)

export const intervalLabel = (
  {
    interval,
    intervalCount,
    stripePriceMode,
  }: {
    interval: Nullish<string>
    intervalCount: Nullish<number>
    /**
     * StripePriceMode is an enum, but it's stringified in the database
     * so we need to cast to string
     */
    stripePriceMode: Nullish<StripePriceMode | string>
  },
  prefix: Nullish<'/' | 'every'>
) => {
  if (stripePriceMode === StripePriceMode.Payment) {
    return ``
  }
  if (intervalCount === 1) {
    return prefix ? `${prefix} ${interval}` : interval
  }
  if (!interval) {
    return ''
  }
  const base = `${intervalCount} ${interval}s`
  return prefix ? `${prefix} ${base}` : base
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const authorizationHeaderTokenMatchesEnvToken = (params: {
  headerValue: string
  tokenEnvVariableKey: string
}) => {
  const { headerValue, tokenEnvVariableKey } = params
  const headerToken = headerValue.split(' ')[1]
  const token = envVariable(tokenEnvVariableKey)
  return headerToken === token
}

export const createInvoiceNumberBase = customAlphabet(
  `ABCDEF0123456789`,
  7
)

export const createInvoiceNumber = (
  invoiceNumberBase: string,
  number: number
) => {
  return `${invoiceNumberBase}-${number.toString().padStart(5, '0')}`
}

export const safeZodAlwaysNull = z
  .any()
  .transform(() => null)
  .describe('safeZodAlwaysNull')

export const getCurrentMonthStartTimestamp = (
  anchorDate: Date
): Date => {
  // Get the start of the anchor date in UTC
  const startOfCurrentMonth = startOfMonth(anchorDate)

  // Ensure UTC midnight (00:00:00.000)
  const utcStart = setMilliseconds(
    setSeconds(setMinutes(setHours(startOfCurrentMonth, 0), 0), 0),
    0
  )

  return utcStart
}

/**
 * Converts a string to title case
 * @param str
 * @returns
 */
export const titleCase = (str: string) => {
  if (!str) {
    return str
  }
  return sentenceCase(str)
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export const keysToCamelCase = <T extends Record<string, unknown>>(
  obj: T
): { [K in keyof T]: T[K] } => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [camelCase(key), value])
  ) as { [K in keyof T]: T[K] }
}

export const gitCommitId = () => {
  const commitId = envVariable('VERCEL_GIT_COMMIT_SHA')
  if (IS_DEV && !commitId) {
    return '__DEV__'
  }
  if (IS_TEST && !commitId) {
    return '__TEST__'
  }
  if (!commitId) {
    throw new Error('VERCEL_GIT_COMMIT_SHA is not set')
  }
  return commitId
}
const LOCALHOST_URL = 'http://localhost:3000'

const NEXT_PUBLIC_APP_URL = IS_TEST
  ? LOCALHOST_URL
  : process.env.NEXT_PUBLIC_APP_URL || LOCALHOST_URL

export const emailBaseUrl = NEXT_PUBLIC_APP_URL

export const customerBillingPortalURL = (params: {
  organizationId: string
  customerId?: string
}) => {
  const { organizationId, customerId } = params
  return safeUrl(
    `/billing-portal/${organizationId}/${customerId || ''}`,
    NEXT_PUBLIC_APP_URL
  )
}

export const organizationBillingPortalURL = (params: {
  organizationId: string
}) => {
  const { organizationId } = params
  return safeUrl(
    `/billing-portal/${organizationId}`,
    NEXT_PUBLIC_APP_URL
  )
}

export const nowTime = () => Date.now()

// Input validation schemas for security
export const safeZodSanitizedString = z
  .string()
  .trim()
  .min(1, 'Field is required')
  .max(255, 'Field must be less than 255 characters')

export const core = {
  IS_PROD,
  IS_TEST,
  IS_LOCAL_PLAYGROUND,
  TEST_DB_URL,
  DEV_ENVIRONMENT_NOTIF_PREFIX,
  NEXT_PUBLIC_APP_URL,
  notEmptyOrNil,
  envVariable,
  camelCase,
  safeUrl,
  fetch: middlewareFetch,
  post,
  sliceIntoChunks,
  // localizedEnvVariable,
  formatDate,
  safeContactList,
  devPrefixString,
  log,
  error,
  noOp,
  isNil,
  groupBy,
  chunkArray,
  has,
  generateCacheKeys,
  cosineSimilarity,
  areDatabaseIdsEqual,
  constructMidnightDate,
  emailAddressToCompanyDomain,
  nanoid,
  amountInDollars,
  omit,
  intervalLabel,
  sleep,
  createSafeZodEnum,
  cn,
  authorizationHeaderTokenMatchesEnvToken,
  createInvoiceNumber,
  formatDateRange,
  gitCommitId,
  customerBillingPortalURL,
  organizationBillingPortalURL,
  nowTime,
  safeZodNullOrUndefined,
  safeZodNullishString,
  safeZodDate,
  safeZodAlwaysNull,
  safeZodNonNegativeInteger,
  safeZodSanitizedString,
  IS_DEV,
}

export default core
