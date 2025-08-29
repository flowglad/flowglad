// Zero-decimal currencies (don't use decimal places)
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW',
  'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF',
  'XOF', 'XPF'
])

/**
 * Maps currency codes to their display symbols
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  KRW: '₩',
  CAD: '$',
  AUD: '$',
  CHF: 'Fr',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  PLN: 'zł',
  CZK: 'Kč',
  HUF: 'Ft',
  RON: 'lei',
  BGN: 'лв',
  HRK: 'kn',
  RUB: '₽',
  TRY: '₺',
  BRL: 'R$',
  ZAR: 'R',
  SGD: '$',
  HKD: '$',
  NZD: '$',
  MXN: '$',
  PHP: '₱',
  IDR: 'Rp',
  THB: '฿',
  MYR: 'RM',
  VND: '₫',
  // Add more as needed
}

/**
 * Checks if a currency is zero-decimal (doesn't use decimal places)
 * @param currencyCode - The ISO 4217 currency code
 * @returns true if the currency is zero-decimal
 */
export function isCurrencyZeroDecimal(currencyCode: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase())
}

/**
 * Gets the currency symbol or character for a given currency code
 * @param currencyCode - The ISO 4217 currency code
 * @returns The currency symbol or the currency code if no symbol is found
 */
export function currencyCharacter(currencyCode: string): string {
  const upperCode = currencyCode.toUpperCase()
  return CURRENCY_SYMBOLS[upperCode] || upperCode
}

/**
 * Formats a currency amount for human-readable display
 * @param unitAmount - The amount in the smallest currency unit (e.g., cents for USD)
 * @param currencyCode - The ISO 4217 currency code
 * @param locale - The locale to use for formatting (default: 'en-US')
 * @returns A formatted currency string
 */
export function humanReadableCurrencyAmount(
  unitAmount: number,
  currencyCode: string,
  locale: string = 'en-US'
): string {
  const isZeroDecimal = isCurrencyZeroDecimal(currencyCode)
  const amount = isZeroDecimal ? unitAmount : unitAmount / 100

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: isZeroDecimal ? 0 : undefined,
      maximumFractionDigits: isZeroDecimal ? 0 : undefined,
    }).format(amount)
  } catch (error) {
    // Fallback if currency code is not supported
    const symbol = currencyCharacter(currencyCode)
    const formattedAmount = isZeroDecimal
      ? Math.round(amount).toString()
      : amount.toFixed(2)
    return `${symbol}${formattedAmount}`
  }
}