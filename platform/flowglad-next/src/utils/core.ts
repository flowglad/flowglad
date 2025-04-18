import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import omit from 'ramda/src/omit'
import has from 'ramda/src/has'
import {
  format,
  startOfMonth,
  setMinutes,
  setHours,
  setSeconds,
  setMilliseconds,
} from 'date-fns'
import { customAlphabet } from 'nanoid'
import * as Sentry from '@sentry/nextjs'
import type { Readable } from 'node:stream'
import { camelCase } from 'change-case'
import latinMap from './latinMap'
import { z } from 'zod'
import axios, { AxiosRequestConfig } from 'axios'
import { Nullish, StripePriceMode } from '@/types'

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs))
}

export const envVariable = (key: string) => process.env[key] || ''

export const localizedEnvVariable = (key: string) =>
  envVariable(`${envVariable('LOCAL_USER')}_${key}`)

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

export const IS_PROD = process.env.VERCEL_ENV === 'production'
export const IS_TEST = process.env.NODE_ENV === 'test'
export const IS_DEV = process.env.VERCEL_ENV === 'development'
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

export const formatCurrency = (amount: number, cents?: boolean) => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })
  return formatter.format(cents ? amount : Math.round(amount))
}

export const formatDate = (
  date: Date | string,
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

export const safeZodNonNegativeInteger = z
  .number()
  .transform((str) => Number(str))
  .refine(
    (arg) => z.number().int().nonnegative().safeParse(arg).success,
    { message: 'Value must be a non-negative integer' }
  )

export const safeZodPositiveInteger = z
  .number()
  .transform((str) => Number(str))
  .refine(
    (arg) => z.number().int().positive().safeParse(arg).success,
    { message: 'Value must be a positive integer' }
  )
  .describe('safeZodPositiveInteger')

export const safeZodPositiveIntegerOrZero = safeZodPositiveInteger.or(
  z.literal(0)
)

export const safeZodNullOrUndefined = z
  .null()
  .or(z.undefined())
  .nullish()
  .transform(() => {
    return null
  })
  .describe('safeZodNullOrUndefined')

export const safeZodDate = z
  .date()
  .or(z.string())
  .transform((date) => new Date(date))
  .describe('safeZodDate')

export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  21
)

export const createSafeZodEnum = <T extends z.EnumLike>(
  enumType: T
) => {
  return z.nativeEnum(enumType)
  // .or(z.string())
  // .transform((value) => {
  //   let enumValue: T[keyof T] = value as T[keyof T]
  //   if (typeof value === 'string') {
  //     const enumValues = Object.values(enumType) as string[]
  //     const enumKeys = Object.keys(enumType)
  //     const index = enumValues.indexOf(value)
  //     if (index !== -1) {
  //       enumValue =
  //         enumType[enumKeys[index] as keyof typeof enumType]
  //     }
  //   }
  //   return enumValue as T[keyof T]
  // })
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

export function cx(...args: ClassValue[]) {
  return twMerge(clsx(...args))
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
  return str
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

export const core = {
  IS_PROD,
  IS_TEST,
  DEV_ENVIRONMENT_NOTIF_PREFIX,
  notEmptyOrNil,
  envVariable,
  camelCase,
  safeUrl,
  fetch: middlewareFetch,
  post,
  sliceIntoChunks,
  localizedEnvVariable,
  formatDate,
  formatCurrency,
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
  safeZodNullOrUndefined,
  safeZodPositiveInteger,
  safeZodDate,
  safeZodAlwaysNull,
  safeZodPositiveIntegerOrZero,
  safeZodNonNegativeInteger,
  IS_DEV,
}

export default core
