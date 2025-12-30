import { StripeConnectContractType } from '@/types'

export const cardPaymentsCountries = [
  'AU',
  'AT',
  'BE',
  'BG',
  'CA',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'GI',
  'BR',
  'US',
  'FR',
  'DE',
  'GR',
  'HK',
  'HU',
  'IE',
  'IT',
  'JP',
  'LV',
  'LI',
  'LT',
  'LU',
  'MT',
  'MX',
  'NL',
  'NZ',
  'NO',
  'PL',
  'PT',
  'RO',
  'SG',
  'SK',
  'SI',
  'ES',
  'SE',
  'CH',
  'TH',
  'AE',
  'GB',
  'MY',
] as readonly string[]

export const transferCountries = [
  'AL',
  'DZ',
  'AO',
  'AG',
  'AR',
  'AM',
  'AZ',
  'BS',
  'BH',
  'BD',
  'BJ',
  'BT',
  'BO',
  'BA',
  'BW',
  'BN',
  'KH',
  'CL',
  'CO',
  'CR',
  'CI',
  'DO',
  'EC',
  'EG',
  'SV',
  'ET',
  'GA',
  'GM',
  'GH',
  'GI',
  'GT',
  'GY',
  'IS',
  'IN',
  'ID',
  'IL',
  'JM',
  'JO',
  'KZ',
  'KE',
  'KW',
  'LA',
  'MO',
  'MG',
  'MY',
  'MU',
  'MD',
  'MC',
  'MN',
  'MA',
  'MZ',
  'NA',
  'NE',
  'NG',
  'MK',
  'OM',
  'PK',
  'PA',
  'PY',
  'PE',
  'PH',
  'QA',
  'RW',
  'SM',
  'SA',
  'SN',
  'RS',
  'ZA',
  'KR',
  'LK',
  'LC',
  'TW',
  'TZ',
  'TT',
  'TN',
  'TR',
  'US',
  'UY',
  'UZ',
  'VN',
] as readonly string[]

const normalizeCountryCode = (countryCode: string): string =>
  countryCode.trim().toUpperCase()

export const platformEligibleCountries = new Set(
  cardPaymentsCountries
)

export const morEligibleCountries = new Set(transferCountries)

export const isCountryEligibleForPlatform = (
  countryCode: string
): boolean => {
  return platformEligibleCountries.has(
    normalizeCountryCode(countryCode)
  )
}

export const isCountryEligibleForMoR = (
  countryCode: string
): boolean => {
  return morEligibleCountries.has(normalizeCountryCode(countryCode))
}

export const getEligibleFundsFlowsForCountry = (
  countryCode: string
): StripeConnectContractType[] => {
  const normalizedCountryCode = normalizeCountryCode(countryCode)
  const eligibleFlows: StripeConnectContractType[] = []

  if (platformEligibleCountries.has(normalizedCountryCode)) {
    eligibleFlows.push(StripeConnectContractType.Platform)
  }

  if (morEligibleCountries.has(normalizedCountryCode)) {
    eligibleFlows.push(StripeConnectContractType.MerchantOfRecord)
  }

  return eligibleFlows
}

export const isCountryEligibleForAnyFlow = (
  countryCode: string
): boolean => {
  const normalizedCountryCode = normalizeCountryCode(countryCode)
  return (
    platformEligibleCountries.has(normalizedCountryCode) ||
    morEligibleCountries.has(normalizedCountryCode)
  )
}
