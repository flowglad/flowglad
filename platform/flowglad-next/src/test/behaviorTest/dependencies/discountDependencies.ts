/**
 * Discount Dependencies
 *
 * Defines discount configurations for testing tax calculation on
 * post-discount amounts.
 *
 * ## Product Context
 *
 * Discounts reduce the purchase amount before tax is calculated.
 * For MoR organizations, this is critical because:
 * - Tax is calculated on the discounted amount (not full price)
 * - Flowglad fees are calculated on the discounted amount
 * - The payment intent amount reflects the post-discount total
 *
 * ## Testing Strategy
 *
 * Tests run against multiple discount types to ensure:
 * - Tax calculation uses post-discount base amount
 * - Fixed discounts are applied correctly
 * - Percentage discounts are calculated correctly
 * - No discount (null) is handled gracefully
 */

import { DiscountAmountType, DiscountDuration } from '@db-core/enums'
import type { Discount } from '@db-core/schema/discounts'
import { Dependency } from '../index'

/**
 * Configuration for a discount variant.
 *
 * Includes the discount insert data and expected calculation helpers.
 */
interface DiscountConfig {
  /**
   * The discount to create, or null for no discount.
   * Note: id, organizationId, livemode, pricingModelId will be set by the behavior.
   */
  discountInsert: Omit<
    Discount.Insert,
    'id' | 'organizationId' | 'livemode' | 'pricingModelId'
  > | null
  /** Human-readable description of this discount variant */
  description: string
  /**
   * Calculate the expected discount amount given a base price.
   * @param baseAmount - The base price in cents before discount
   * @returns The discount amount in cents
   */
  expectedDiscountAmount: (baseAmount: number) => number
}

/**
 * DiscountDep - Discount configurations for checkout testing.
 *
 * This dependency creates test variants for different discount scenarios,
 * ensuring fee and tax calculations correctly use post-discount amounts.
 *
 * Each variant includes an `expectedDiscountAmount` function to enable
 * precise assertions in tests.
 */
export abstract class DiscountDep extends Dependency<DiscountConfig>() {
  abstract discountInsert: DiscountConfig['discountInsert']
  abstract description: string
  abstract expectedDiscountAmount: (baseAmount: number) => number
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * No Discount
 *
 * Baseline case - no discount applied.
 * Expected discount amount is always 0.
 */
DiscountDep.implement('none', {
  discountInsert: null,
  description: 'No discount applied',
  expectedDiscountAmount: () => 0,
})

/**
 * Fixed $10 Discount
 *
 * A fixed discount that reduces the price by $10.00.
 * Expected discount amount is 1000 cents (capped at baseAmount).
 */
DiscountDep.implement('fixed-10', {
  discountInsert: {
    name: 'Fixed $10 Discount',
    code: 'FIXED10',
    amount: 1000, // $10.00 in cents
    amountType: DiscountAmountType.Fixed,
    active: true,
    duration: DiscountDuration.Once,
    numberOfPayments: null,
  },
  description: '$10 fixed discount',
  expectedDiscountAmount: (baseAmount: number) =>
    Math.min(1000, baseAmount),
})

/**
 * 20% Percentage Discount
 *
 * A percentage discount that reduces the price by 20%.
 * Expected discount amount is calculated as Math.round(baseAmount * 0.20).
 */
DiscountDep.implement('percent-20', {
  discountInsert: {
    name: '20% Off',
    code: 'PERCENT20',
    amount: 20, // 20%
    amountType: DiscountAmountType.Percent,
    active: true,
    duration: DiscountDuration.Once,
    numberOfPayments: null,
  },
  description: '20% percentage discount',
  expectedDiscountAmount: (baseAmount: number) =>
    Math.round(baseAmount * 0.2),
})

/**
 * 100% Full Discount (Free)
 *
 * A percentage discount that makes the item free.
 * Tests edge case where discount equals base amount.
 */
DiscountDep.implement('percent-100', {
  discountInsert: {
    name: 'Free Item',
    code: 'FREE100',
    amount: 100, // 100%
    amountType: DiscountAmountType.Percent,
    active: true,
    duration: DiscountDuration.Once,
    numberOfPayments: null,
  },
  description: '100% discount (free)',
  expectedDiscountAmount: (baseAmount: number) => baseAmount,
})
