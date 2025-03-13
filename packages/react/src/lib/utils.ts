import { format } from 'date-fns'
import { CurrencyCode } from '@flowglad/types'
import { clsx, type ClassValue } from 'clsx'
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
    currency: currency,
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

export function formatDate(date: string) {
  return format(new Date(date), 'MMM d, yyyy')
}
