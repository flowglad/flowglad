/**
 * Customer Residency Dependencies
 *
 * Defines where the customer is physically located, which affects tax
 * calculation and compliance requirements.
 *
 * ## Product Context
 *
 * A customer's billing address determines:
 *
 * - **Tax Jurisdiction**: Which taxes apply (sales tax, VAT, GST)
 * - **Tax Rates**: Specific rates vary by location (NYC has higher rates)
 * - **Compliance Requirements**: Different reporting for different regions
 * - **Currency Display**: Preferred currency for the customer's region
 *
 * ## Impact on Behavior
 *
 * Customer residency interacts with contract type:
 *
 * - **MoR + Any Residency**: Flowglad calculates and collects applicable taxes
 * - **Platform + Any Residency**: Organization handles their own tax compliance
 *
 * ## Testing Strategy
 *
 * Tests run against multiple residencies to ensure:
 * - Tax calculation handles different jurisdictions
 * - Address validation works for various formats
 * - No region-specific bugs in checkout flow
 */

import type { BillingAddress } from '@/db/schema/organizations'
import { CountryCode } from '@/types'
import { Dependency } from '../index'

/**
 * Configuration for a customer residency variant.
 */
interface CustomerResidencyConfig {
  /** The customer's billing address */
  billingAddress: BillingAddress
  /** Human-readable description of this residency */
  description: string
}

/**
 * CustomerResidencyDep - Customer's billing location.
 *
 * This dependency creates test variants for different customer locations,
 * ensuring tax calculation and address handling work correctly across
 * jurisdictions.
 */
export abstract class CustomerResidencyDep extends Dependency<CustomerResidencyConfig>() {
  abstract billingAddress: BillingAddress
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * US Customer in New York City
 *
 * High tax jurisdiction with state + city taxes.
 * Tests US address format and tax calculation.
 */
CustomerResidencyDep.implement('us-nyc', {
  description: 'US customer in NYC',
  billingAddress: {
    address: {
      line1: '123 Broadway',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: CountryCode.US,
    },
  },
})

/**
 * UK Customer in London
 *
 * Tests UK address format (different postal code format).
 * Subject to UK VAT rules.
 */
CustomerResidencyDep.implement('uk-london', {
  description: 'UK customer in London',
  billingAddress: {
    address: {
      line1: '10 Downing Street',
      city: 'London',
      state: 'England',
      postal_code: 'SW1A 2AA',
      country: CountryCode.GB,
    },
  },
})
