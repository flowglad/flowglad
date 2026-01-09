/**
 * Contract Type Dependencies
 *
 * Defines billing model variants for behavior tests.
 * Platform vs Merchant-of-Record affects fee structures and payment flows.
 */

import { StripeConnectContractType } from '@/types'
import { Dependency } from '../index'

/**
 * ContractTypeDep - Defines the Stripe Connect contract type.
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
