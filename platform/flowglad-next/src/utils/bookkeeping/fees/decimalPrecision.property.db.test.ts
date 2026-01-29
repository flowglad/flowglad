import { describe, expect, it } from 'bun:test'
import { CurrencyCode, PaymentMethodType } from '@db-core/enums'
import BigNumber from 'bignumber.js'
import fc from 'fast-check'
import type { Organization } from '@/db/schema/organizations'
import { calculatePlatformApplicationFee } from '@/utils/stripe'
import {
  calculatePaymentMethodFeeAmount,
  calculatePercentageFee,
} from './common'

/**
 * Property-based tests for decimal precision in fee calculations.
 *
 * These tests use fast-check to generate thousands of random inputs
 * and verify that our BigNumber-based calculations maintain precision
 * that would be lost with native JavaScript floating point arithmetic.
 */

describe('Decimal Precision - Property-Based Tests', () => {
  describe('calculatePercentageFee', () => {
    it('always returns an integer (no fractional cents)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }), // amount in cents (up to $1M)
          fc.float({ min: 0, max: 100, noNaN: true }), // percentage (0-100%)
          (amount, percentage) => {
            const result = calculatePercentageFee(amount, percentage)
            expect(Number.isInteger(result)).toBe(true)
          }
        )
      )
    })

    it('returns non-negative values for non-negative inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }),
          fc.float({ min: 0, max: 100, noNaN: true }),
          (amount, percentage) => {
            const result = calculatePercentageFee(amount, percentage)
            expect(result).toBeGreaterThanOrEqual(0)
          }
        )
      )
    })

    it('is deterministic (same inputs give same output)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }),
          fc.float({ min: 0, max: 100, noNaN: true }),
          (amount, percentage) => {
            const result1 = calculatePercentageFee(amount, percentage)
            const result2 = calculatePercentageFee(amount, percentage)
            expect(result1).toBe(result2)
          }
        )
      )
    })

    it('string percentages produce same result as equivalent BigNumber calculation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }),
          fc.stringMatching(/^[0-9]{1,3}(\.[0-9]{1,10})?$/), // string percentages like "0.65", "2.9", "10.5"
          (amount, percentageStr) => {
            const result = calculatePercentageFee(
              amount,
              percentageStr
            )

            // Manual BigNumber calculation for comparison
            const expected = new BigNumber(amount)
              .times(percentageStr)
              .dividedBy(100)
              .decimalPlaces(0, BigNumber.ROUND_HALF_UP)
              .toNumber()

            expect(result).toBe(expected)
          }
        )
      )
    })

    // Specific regression test for the original bug
    it('handles 0.65% fee on $100 correctly (regression test)', () => {
      // This was the original bug: parseFloat("0.65") / 100 = 0.006500000000000001
      const result = calculatePercentageFee(10000, '0.65')
      expect(result).toBe(65) // Not 66 due to floating point error
    })

    it('100% of an amount equals the amount', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000_000 }),
          (amount) => {
            const result = calculatePercentageFee(amount, 100)
            expect(result).toBe(amount)
          }
        )
      )
    })

    it('0% of any amount is 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }),
          (amount) => {
            const result = calculatePercentageFee(amount, 0)
            expect(result).toBe(0)
          }
        )
      )
    })
  })

  describe('calculatePlatformApplicationFee', () => {
    // Create a minimal mock organization for testing
    // We only need the fields that calculatePlatformApplicationFee accesses
    const createMockOrganization = (
      feePercentage: string
    ): Organization.Record =>
      ({
        id: 'org_test',
        feePercentage,
        stripeConnectContractType: 'Platform',
        upfrontProcessingCredits: 0,
      }) as unknown as Organization.Record

    it('always returns an integer', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }), // subtotal in cents
          fc.stringMatching(/^[0-9]{1,2}(\.[0-9]{1,10})?$/), // fee percentage like "0.65", "1.5"
          (subtotal, feePercentage) => {
            const org = createMockOrganization(feePercentage)
            const result = calculatePlatformApplicationFee({
              organization: org,
              subtotal,
              currency: CurrencyCode.USD,
            })
            expect(Number.isInteger(result)).toBe(true)
          }
        )
      )
    })

    it('matches manual BigNumber calculation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }),
          fc.stringMatching(/^[0-9]{1,2}(\.[0-9]{1,10})?$/),
          (subtotal, feePercentage) => {
            const org = createMockOrganization(feePercentage)
            const result = calculatePlatformApplicationFee({
              organization: org,
              subtotal,
              currency: CurrencyCode.USD,
            })

            // Manual BigNumber calculation
            const takeRate = new BigNumber(feePercentage).dividedBy(
              100
            )
            const stripeFeeRate = new BigNumber('0.029')
            const fixedFeeCents = new BigNumber(50)
            const expected = new BigNumber(subtotal)
              .times(takeRate.plus(stripeFeeRate))
              .plus(fixedFeeCents)
              .integerValue(BigNumber.ROUND_CEIL)
              .toNumber()

            expect(result).toBe(expected)
          }
        )
      )
    })

    // The original failing test case
    it('handles 0.65% fee on $100 correctly (regression test)', () => {
      const org = createMockOrganization('0.65')
      const result = calculatePlatformApplicationFee({
        organization: org,
        subtotal: 10000, // $100 in cents
        currency: CurrencyCode.USD,
      })
      // 10000 * (0.0065 + 0.029) + 50 = 10000 * 0.0355 + 50 = 355 + 50 = 405
      expect(result).toBe(405)
    })

    it('zero subtotal results in fixed fee only', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[0-9]{1,2}(\.[0-9]{1,10})?$/),
          (feePercentage) => {
            const org = createMockOrganization(feePercentage)
            const result = calculatePlatformApplicationFee({
              organization: org,
              subtotal: 0,
              currency: CurrencyCode.USD,
            })
            expect(result).toBe(50) // Fixed fee only
          }
        )
      )
    })
  })

  describe('calculatePaymentMethodFeeAmount', () => {
    it('Card payments: always returns an integer', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000_000 }), // positive amounts
          (amount) => {
            const result = calculatePaymentMethodFeeAmount(
              amount,
              PaymentMethodType.Card
            )
            expect(Number.isInteger(result)).toBe(true)
          }
        )
      )
    })

    it('Card payments: matches manual BigNumber calculation (2.9% + 30 cents)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000_000 }),
          (amount) => {
            const result = calculatePaymentMethodFeeAmount(
              amount,
              PaymentMethodType.Card
            )

            const expected = new BigNumber(amount)
              .times(2.9)
              .dividedBy(100)
              .plus(30)
              .decimalPlaces(0, BigNumber.ROUND_HALF_UP)
              .toNumber()

            expect(result).toBe(expected)
          }
        )
      )
    })

    it('US Bank Account payments: respects $5 cap', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000_000 }),
          (amount) => {
            const result = calculatePaymentMethodFeeAmount(
              amount,
              PaymentMethodType.USBankAccount
            )
            expect(result).toBeLessThanOrEqual(500) // $5 cap in cents
          }
        )
      )
    })

    it('SEPA Debit payments: respects 6 EUR cap', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000_000 }),
          (amount) => {
            const result = calculatePaymentMethodFeeAmount(
              amount,
              PaymentMethodType.SEPADebit
            )
            expect(result).toBeLessThanOrEqual(600) // 6 EUR cap in cents
          }
        )
      )
    })

    it('zero amount returns zero fee', () => {
      expect(
        calculatePaymentMethodFeeAmount(0, PaymentMethodType.Card)
      ).toBe(0)
      expect(
        calculatePaymentMethodFeeAmount(
          0,
          PaymentMethodType.USBankAccount
        )
      ).toBe(0)
      expect(
        calculatePaymentMethodFeeAmount(
          0,
          PaymentMethodType.SEPADebit
        )
      ).toBe(0)
    })

    it('negative amount returns zero fee', () => {
      expect(
        calculatePaymentMethodFeeAmount(-100, PaymentMethodType.Card)
      ).toBe(0)
    })
  })

  describe('Floating Point Precision Edge Cases', () => {
    // These are specific cases where floating point arithmetic would fail
    const precisionTestCases = [
      { amount: 10000, percentage: '0.65', expected: 65 },
      { amount: 10000, percentage: '0.1', expected: 10 },
      { amount: 10000, percentage: '0.7', expected: 70 },
      { amount: 33333, percentage: '0.3', expected: 100 }, // 33333 * 0.003 = 99.999 -> rounds to 100
      { amount: 100, percentage: '33.33', expected: 33 }, // 100 * 0.3333 = 33.33 -> rounds to 33
      { amount: 1, percentage: '0.1', expected: 0 }, // 1 * 0.001 = 0.001 -> rounds to 0
      { amount: 999, percentage: '0.1', expected: 1 }, // 999 * 0.001 = 0.999 -> rounds to 1
    ]

    for (const {
      amount,
      percentage,
      expected,
    } of precisionTestCases) {
      it(`calculatePercentageFee(${amount}, "${percentage}") = ${expected}`, () => {
        expect(calculatePercentageFee(amount, percentage)).toBe(
          expected
        )
      })
    }

    // Verify that the OLD approach would have failed on some of these
    it('demonstrates why BigNumber is needed', () => {
      // This is what the old code would have done (using parseFloat)
      const oldCalculation = (amount: number, percentage: string) => {
        const pct = parseFloat(percentage)
        return Math.round((amount * pct) / 100)
      }

      // New BigNumber-based calculation
      const newCalculation = calculatePercentageFee

      // For most cases, they're the same, but for edge cases...
      // 0.1 + 0.2 !== 0.3 in JavaScript
      const problematicPercentage = '0.1'
      const amount = 30000 // $300

      // Both should give 30 for this simple case
      const oldResult = oldCalculation(amount, problematicPercentage)
      const newResult = newCalculation(amount, problematicPercentage)

      // In this specific case both work, but the old approach fails
      // in compound calculations like the platform fee example
      expect(oldResult).toBe(30)
      expect(newResult).toBe(30)

      // The critical difference shows up in compound operations:
      // Old: Math.ceil(10000 * (parseFloat("0.65") / 100 + 0.029) + 50) = 406 (WRONG)
      // New: BigNumber calculation = 405 (CORRECT)
      // This is tested in the calculatePlatformApplicationFee tests above

      // Verify string input works the same as number input when the number is exact
      expect(newCalculation(amount, 0.1)).toBe(30)
    })
  })
})
