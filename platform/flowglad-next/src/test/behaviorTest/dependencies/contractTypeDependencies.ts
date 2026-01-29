/**
 * Contract Type Dependencies
 *
 * Defines billing model variants for behavior tests, representing the
 * fundamental choice between Platform and Merchant of Record models.
 *
 * ## Product Context
 *
 * Flowglad supports two fundamentally different billing models:
 *
 * ### Platform Model
 *
 * The organization is the merchant of record for their transactions:
 * - Organization handles tax compliance directly
 * - Organization's name appears on customer credit card statements
 * - Currency matches the organization's country
 * - Lower Flowglad fees (no tax/compliance services)
 * - Organization responsible for refunds, chargebacks, disputes
 *
 * ### Merchant of Record (MoR) Model
 *
 * Flowglad acts as the merchant of record:
 * - Flowglad handles tax calculation, collection, and remittance
 * - "Flowglad" appears on customer credit card statements
 * - All transactions in USD (Flowglad handles conversion)
 * - Higher fees include tax compliance services
 * - Flowglad handles refunds, chargebacks, disputes
 *
 * ## Impact on Behavior
 *
 * Many behaviors differ based on contract type:
 * - **Checkout**: MoR triggers fee calculation with tax; Platform does not
 * - **Currency**: MoR always USD; Platform uses organization's currency
 * - **Invoices**: MoR includes tax line items; Platform does not
 * - **Refunds**: MoR processed by Flowglad; Platform by organization
 *
 * ## Testing Strategy
 *
 * Tests run against both contract types to ensure:
 * - Fee calculations are correct for each model
 * - Tax handling only occurs for MoR
 * - Currency handling is appropriate for each model
 * - No model-specific bugs slip through
 */

import {
  CurrencyCode,
  StripeConnectContractType,
} from '@db-core/enums'
import { Dependency } from '../index'

/**
 * Configuration for a contract type variant.
 */
interface ContractTypeConfig {
  /** The Stripe Connect contract type */
  contractType: StripeConnectContractType
  /**
   * Returns the appropriate currency for this contract type.
   *
   * - MoR: Always USD (Flowglad handles conversion)
   * - Platform: Uses the organization's default currency
   */
  getCurrency: (
    organizationDefaultCurrency: CurrencyCode
  ) => CurrencyCode
}

/**
 * ContractTypeDep - Organization's billing model choice.
 *
 * This is one of the most important dependencies as it fundamentally
 * changes how payments, taxes, and fees work throughout the system.
 */
export abstract class ContractTypeDep extends Dependency<ContractTypeConfig>() {
  abstract contractType: StripeConnectContractType
  abstract getCurrency: (
    organizationDefaultCurrency: CurrencyCode
  ) => CurrencyCode
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Platform Contract
 *
 * Organization is the merchant of record.
 * - Lower fees
 * - Organization handles tax compliance
 * - Organization's currency
 * - Organization's name on statements
 */
ContractTypeDep.implement('platform', {
  contractType: StripeConnectContractType.Platform,
  getCurrency: (organizationDefaultCurrency) =>
    organizationDefaultCurrency,
})

/**
 * Merchant of Record Contract
 *
 * Flowglad is the merchant of record.
 * - Higher fees (includes tax services)
 * - Flowglad handles tax compliance
 * - Always USD
 * - "Flowglad" on statements
 */
ContractTypeDep.implement('merchantOfRecord', {
  contractType: StripeConnectContractType.MerchantOfRecord,
  getCurrency: () => CurrencyCode.USD,
})
