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

import { CountryCode } from '@db-core/enums'
import type { BillingAddress } from '@db-core/schema/organizations'
import { Dependency } from '../index'

/**
 * Configuration for a customer residency variant.
 *
 * Includes not just the billing address, but also expected tax behavior
 * to enable precise assertions in tests.
 */
interface CustomerResidencyConfig {
  /** The customer's billing address */
  billingAddress: BillingAddress
  /** Human-readable description of this residency */
  description: string
  /**
   * Expected tax rate for MoR transactions to this location.
   * This is the rate Flowglad would charge if registered in this jurisdiction.
   * 0 means no tax (either no-sales-tax state or not registered).
   */
  expectedTaxRate: number
  /**
   * Whether Flowglad is tax-registered in this jurisdiction.
   * When true, MoR transactions will have real tax calculations.
   * When false, MoR transactions will have 0 tax (notaxoverride).
   */
  isFlowgladRegistered: boolean
}

/**
 * CustomerResidencyDep - Customer's billing location.
 *
 * This dependency creates test variants for different customer locations,
 * ensuring tax calculation and address handling work correctly across
 * jurisdictions.
 *
 * Each variant includes expected tax behavior to enable precise assertions:
 * - `expectedTaxRate`: The rate to expect for MoR transactions
 * - `isFlowgladRegistered`: Whether Flowglad collects tax in this jurisdiction
 */
export abstract class CustomerResidencyDep extends Dependency<CustomerResidencyConfig>() {
  abstract billingAddress: BillingAddress
  abstract description: string
  abstract expectedTaxRate: number
  abstract isFlowgladRegistered: boolean
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * US Customer in New York City (Tax Registered)
 *
 * High tax jurisdiction with state + city taxes.
 * Flowglad is registered to collect tax in NY.
 * Combined rate: 8.875% (NY state 4% + NYC 4.5% + MTA 0.375%)
 */
CustomerResidencyDep.implement('us-nyc', {
  description: 'US customer in NYC (tax registered)',
  billingAddress: {
    address: {
      line1: '123 Broadway',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: CountryCode.US,
    },
  },
  expectedTaxRate: 0.08875,
  isFlowgladRegistered: true,
})

/**
 * US Customer in Oregon (No Sales Tax State)
 *
 * Oregon has no state sales tax, so even for MoR
 * transactions there is no tax to collect.
 */
CustomerResidencyDep.implement('us-oregon', {
  description: 'US customer in Oregon (no sales tax)',
  billingAddress: {
    address: {
      line1: '1234 NW Glisan St',
      city: 'Portland',
      state: 'OR',
      postal_code: '97209',
      country: CountryCode.US,
    },
  },
  expectedTaxRate: 0,
  isFlowgladRegistered: false, // No tax nexus needed - no sales tax
})

/**
 * US Customer in Texas (Not Registered)
 *
 * Texas has sales tax, but Flowglad is not registered there.
 * MoR transactions will have 0 tax until Flowglad establishes nexus.
 */
CustomerResidencyDep.implement('us-texas-unregistered', {
  description: 'US customer in Texas (not registered)',
  billingAddress: {
    address: {
      line1: '500 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: CountryCode.US,
    },
  },
  expectedTaxRate: 0, // Would be 8.25% if registered
  isFlowgladRegistered: false,
})

/**
 * UK Customer in London (VAT Registered)
 *
 * UK has 20% VAT on digital services.
 * Flowglad is VAT registered in the UK.
 */
CustomerResidencyDep.implement('uk-london', {
  description: 'UK customer in London (VAT registered)',
  billingAddress: {
    address: {
      line1: '10 Downing Street',
      city: 'London',
      state: 'England',
      postal_code: 'SW1A 2AA',
      country: CountryCode.GB,
    },
  },
  expectedTaxRate: 0.2, // 20% UK VAT
  isFlowgladRegistered: true,
})

/**
 * German Customer in Berlin (VAT Registered)
 *
 * Germany has 19% VAT on digital services.
 * Flowglad is VAT registered in the EU.
 */
CustomerResidencyDep.implement('de-berlin', {
  description: 'German customer in Berlin (VAT registered)',
  billingAddress: {
    address: {
      line1: 'Unter den Linden 77',
      city: 'Berlin',
      state: 'Berlin',
      postal_code: '10117',
      country: CountryCode.DE,
    },
  },
  expectedTaxRate: 0.19, // 19% German VAT
  isFlowgladRegistered: true,
})
