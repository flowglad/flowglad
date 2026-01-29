import { CountryCode, CurrencyCode } from '@db-core/enums'
import core from '@/utils/core'

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
