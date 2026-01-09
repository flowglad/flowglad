/**
 * Country Dependencies
 *
 * Defines geographic variants for behavior tests, representing the country
 * where an organization is legally based.
 *
 * ## Product Context
 *
 * An organization's country determines several critical aspects of their
 * Flowglad experience:
 *
 * - **Default Currency**: Platform organizations use their country's currency
 * - **Tax Jurisdiction**: Affects how taxes are calculated and remitted
 * - **Stripe Availability**: Not all Stripe features are available everywhere
 * - **Payout Timing**: Bank transfer speeds vary by country
 *
 * ## Supported Countries
 *
 * Flowglad supports organizations in countries where Stripe Connect is
 * available. The implementations below cover major markets:
 *
 * - **US**: United States (USD) - Full feature support
 * - **DE**: Germany (EUR) - EU regulations, SEPA payments
 * - **GB**: United Kingdom (GBP) - UK-specific compliance
 * - **AU**: Australia (AUD) - APAC market
 *
 * ## Testing Strategy
 *
 * Tests run against all country variants to ensure:
 * - Currency handling works correctly for each currency
 * - No country-specific bugs slip through
 * - Features work across different regulatory environments
 */

import { CountryCode, CurrencyCode } from '@/types'
import { Dependency } from '../index'

/**
 * Configuration for a country variant.
 */
interface CountryConfig {
  /** The ISO country code */
  countryCode: CountryCode
  /** The default currency for Platform organizations in this country */
  expectedCurrency: CurrencyCode
}

/**
 * CountryDep - Organization's country of legal incorporation.
 *
 * This dependency creates test variants for different geographic markets,
 * ensuring behavior correctness across all supported countries.
 */
export abstract class CountryDep extends Dependency<CountryConfig>() {
  abstract countryCode: CountryCode
  abstract expectedCurrency: CurrencyCode
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * United States
 *
 * Primary market with full feature support.
 * Currency: USD
 */
CountryDep.implement('us', {
  countryCode: CountryCode.US,
  expectedCurrency: CurrencyCode.USD,
})

/**
 * Germany
 *
 * EU market with SEPA payment support.
 * Currency: EUR
 * Note: Subject to EU billing regulations
 */
CountryDep.implement('de', {
  countryCode: CountryCode.DE,
  expectedCurrency: CurrencyCode.EUR,
})

/**
 * United Kingdom
 *
 * UK market with GBP currency.
 * Currency: GBP
 * Note: Post-Brexit regulatory environment
 */
CountryDep.implement('gb', {
  countryCode: CountryCode.GB,
  expectedCurrency: CurrencyCode.GBP,
})

/**
 * Australia
 *
 * APAC market with AUD currency.
 * Currency: AUD
 */
CountryDep.implement('au', {
  countryCode: CountryCode.AU,
  expectedCurrency: CurrencyCode.AUD,
})
