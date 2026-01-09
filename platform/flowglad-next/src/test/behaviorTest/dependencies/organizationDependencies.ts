/**
 * Shared Organization Dependencies
 *
 * Reusable dependencies for configuring organizations in behavior tests.
 */

import {
  CountryCode,
  CurrencyCode,
  StripeConnectContractType,
} from '@/types'
import { Dependency } from '../index'

// ============================================================================
// CountryDep
// ============================================================================

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

// ============================================================================
// ContractTypeDep
// ============================================================================

/**
 * ContractTypeDep - Defines the Stripe Connect contract type.
 * Platform vs Merchant-of-Record affects fee structures and payment flows.
 */
interface ContractTypeConfig {
  contractType: StripeConnectContractType
}

export abstract class ContractTypeDep extends Dependency<ContractTypeConfig>() {
  abstract contractType: StripeConnectContractType
}

// Default implementations
ContractTypeDep.implement('platform', {
  contractType: StripeConnectContractType.Platform,
})

ContractTypeDep.implement('merchantOfRecord', {
  contractType: StripeConnectContractType.MerchantOfRecord,
})
