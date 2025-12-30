import type { CurrencyCode } from '@flowglad/shared'
import { type ClassValue, clsx } from 'clsx'
import { format } from 'date-fns'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function currencyCharacter(
  currency: CurrencyCode,
  locale: Intl.LocalesArgument
) {
  const defaultLocale =
    typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  return (0)
    .toLocaleString(locale ?? defaultLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    .replace(/\d/g, '')
    .trim()
}

export function humanReadableCurrencyAmount(
  currency: CurrencyCode,
  amount: number
) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  })
  if (!isCurrencyZeroDecimal(currency)) {
    return formatter.format(Number((amount / 100).toFixed(2)))
  }
  return formatter.format(amount)
}

export const zeroDecimalCurrencies = [
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]

export function isCurrencyZeroDecimal(currency: CurrencyCode) {
  return zeroDecimalCurrencies.includes(currency)
}

export function formatDate(date: Date | string | number) {
  return format(
    date instanceof Date ? date : new Date(date),
    'MMM d, yyyy'
  )
}

export function devWarn(message: string) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[flowglad]: ${message}`)
  }
}

export function devError(message: string) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[flowglad]: ${message}`)
  }
}
