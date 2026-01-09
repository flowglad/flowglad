/**
 * Country Dependencies
 *
 * Defines geographic variants for behavior tests.
 */

import { CountryCode, CurrencyCode } from '@/types'
import { Dependency } from '../index'

/**
 * CountryDep - Defines which country the organization is based in.
 * Different countries have different currency defaults and payment eligibility.
 */
interface CountryConfig {
  countryCode: CountryCode
  expectedCurrency: CurrencyCode
}

export abstract class CountryDep extends Dependency<CountryConfig>() {
  abstract countryCode: CountryCode
  abstract expectedCurrency: CurrencyCode
}

// Default implementations
CountryDep.implement('us', {
  countryCode: CountryCode.US,
  expectedCurrency: CurrencyCode.USD,
})

CountryDep.implement('de', {
  countryCode: CountryCode.DE,
  expectedCurrency: CurrencyCode.EUR,
})

CountryDep.implement('gb', {
  countryCode: CountryCode.GB,
  expectedCurrency: CurrencyCode.GBP,
})

CountryDep.implement('au', {
  countryCode: CountryCode.AU,
  expectedCurrency: CurrencyCode.AUD,
})
