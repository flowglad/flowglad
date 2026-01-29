import core from '@/utils/core'
import { CountryCode, CurrencyCode } from './enums'

export const currencyCodeSchema = core
  .createSafeZodEnum(CurrencyCode)
  .meta({
    id: 'CurrencyCode',
    description: 'Currency code',
  })

export const countryCodeSchema = core
  .createSafeZodEnum(CountryCode)
  .meta({
    id: 'CountryCode',
    description: 'ISO 3166-1 alpha-2 country code',
  })
