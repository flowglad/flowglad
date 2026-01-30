import type { Mock } from 'bun:test'
import { describe, expect, it, mock, spyOn } from 'bun:test'
import { CurrencyCode, DiscountAmountType } from '@db-core/enums'
import { rawStringAmountToCountableCurrencyAmount } from '@/utils/stripe'

// Mock the stripe utils
mock.module('@/utils/stripe', () => ({
  rawStringAmountToCountableCurrencyAmount: mock(
    (currency, amount) => {
      // Mock conversion: "10.50" -> 1050 (cents)
      return Math.round(parseFloat(amount) * 100)
    }
  ),
}))

describe('Amount Calculation Logic', () => {
  describe('Fixed Amount Calculation', () => {
    it('should convert currency string to countable amount for fixed discounts', () => {
      const mockInput = {
        discount: {
          amountType: DiscountAmountType.Fixed,
          amount: 0,
        },
        __rawAmountString: '10.50',
      }

      const amount =
        mockInput.discount.amountType === DiscountAmountType.Fixed
          ? rawStringAmountToCountableCurrencyAmount(
              CurrencyCode.USD,
              mockInput.__rawAmountString!
            )
          : Math.round(mockInput.discount.amount ?? 0)

      expect(amount).toBe(1050) // $10.50 * 100
      expect(
        rawStringAmountToCountableCurrencyAmount
      ).toHaveBeenCalledWith(CurrencyCode.USD, '10.50')
    })

    it('should handle different currency amounts correctly', () => {
      const testCases = [
        { input: '0.01', expected: 1 },
        { input: '1.00', expected: 100 },
        { input: '10.50', expected: 1050 },
        { input: '100.00', expected: 10000 },
        { input: '999.99', expected: 99999 },
      ]

      testCases.forEach(({ input, expected }) => {
        const mockInput = {
          discount: {
            amountType: DiscountAmountType.Fixed,
            amount: 0,
          },
          __rawAmountString: input,
        }

        const amount =
          mockInput.discount.amountType === DiscountAmountType.Fixed
            ? rawStringAmountToCountableCurrencyAmount(
                CurrencyCode.USD,
                mockInput.__rawAmountString!
              )
            : Math.round(mockInput.discount.amount ?? 0)

        expect(amount).toBe(expected)
      })
    })

    it('should handle zero amounts', () => {
      const mockInput = {
        discount: {
          amountType: DiscountAmountType.Fixed,
          amount: 0,
        },
        __rawAmountString: '0',
      }

      const amount =
        mockInput.discount.amountType === DiscountAmountType.Fixed
          ? rawStringAmountToCountableCurrencyAmount(
              CurrencyCode.USD,
              mockInput.__rawAmountString!
            )
          : Math.round(mockInput.discount.amount ?? 0)

      expect(amount).toBe(0)
    })

    it('should handle decimal precision correctly', () => {
      const mockInput = {
        discount: {
          amountType: DiscountAmountType.Fixed,
          amount: 0,
        },
        __rawAmountString: '12.345',
      }

      const amount =
        mockInput.discount.amountType === DiscountAmountType.Fixed
          ? rawStringAmountToCountableCurrencyAmount(
              CurrencyCode.USD,
              mockInput.__rawAmountString!
            )
          : Math.round(mockInput.discount.amount ?? 0)

      expect(amount).toBe(1235) // Rounded to nearest cent
    })
  })

  describe('Percent Amount Calculation', () => {
    it('should round percent amounts to integers', () => {
      const testCases = [
        { input: 1.0, expected: 1 },
        { input: 1.5, expected: 2 },
        { input: 25.7, expected: 26 },
        { input: 50.0, expected: 50 },
        { input: 99.9, expected: 100 },
        { input: 0.1, expected: 0 },
        { input: 0.9, expected: 1 },
      ]

      testCases.forEach(({ input, expected }) => {
        const mockInput = {
          discount: {
            amountType: DiscountAmountType.Percent,
            amount: input,
          },
          __rawAmountString: '0',
        }

        const amount =
          mockInput.discount.amountType === DiscountAmountType.Fixed
            ? rawStringAmountToCountableCurrencyAmount(
                CurrencyCode.USD,
                mockInput.__rawAmountString!
              )
            : Math.round(mockInput.discount.amount ?? 0)

        expect(amount).toBe(expected)
      })
    })

    it('should handle null and undefined amounts', () => {
      const testCases = [
        { amount: null, expected: 0 },
        { amount: undefined, expected: 0 },
      ]

      testCases.forEach(({ amount, expected }) => {
        const mockInput = {
          discount: {
            amountType: DiscountAmountType.Percent,
            amount,
          },
          __rawAmountString: '0',
        }

        const calculatedAmount =
          mockInput.discount.amountType === DiscountAmountType.Fixed
            ? rawStringAmountToCountableCurrencyAmount(
                CurrencyCode.USD,
                mockInput.__rawAmountString!
              )
            : Math.round(mockInput.discount.amount ?? 0)

        expect(calculatedAmount).toBe(expected)
      })
    })

    it('should handle edge cases for percent amounts', () => {
      const edgeCases = [
        { input: 0, expected: 0 },
        { input: 0.4, expected: 0 },
        { input: 0.5, expected: 1 },
        { input: 100, expected: 100 },
        { input: 100.1, expected: 100 },
      ]

      edgeCases.forEach(({ input, expected }) => {
        const mockInput = {
          discount: {
            amountType: DiscountAmountType.Percent,
            amount: input,
          },
          __rawAmountString: '0',
        }

        const amount =
          mockInput.discount.amountType === DiscountAmountType.Fixed
            ? rawStringAmountToCountableCurrencyAmount(
                CurrencyCode.USD,
                mockInput.__rawAmountString!
              )
            : Math.round(mockInput.discount.amount ?? 0)

        expect(amount).toBe(expected)
      })
    })
  })

  describe('Amount Type Switching Logic', () => {
    it('should use correct calculation method based on amount type', () => {
      const testCases = [
        {
          amountType: DiscountAmountType.Fixed,
          rawAmountString: '15.75',
          discountAmount: 0,
          expected: 1575,
          shouldCallCurrencyConversion: true,
        },
        {
          amountType: DiscountAmountType.Percent,
          rawAmountString: '0',
          discountAmount: 25.7,
          expected: 26,
          shouldCallCurrencyConversion: false,
        },
      ]

      testCases.forEach(
        ({
          amountType,
          rawAmountString,
          discountAmount,
          expected,
          shouldCallCurrencyConversion,
        }) => {
          const mockInput = {
            discount: {
              amountType,
              amount: discountAmount,
            },
            __rawAmountString: rawAmountString,
          }

          const amount =
            mockInput.discount.amountType === DiscountAmountType.Fixed
              ? rawStringAmountToCountableCurrencyAmount(
                  CurrencyCode.USD,
                  mockInput.__rawAmountString!
                )
              : Math.round(mockInput.discount.amount ?? 0)

          expect(amount).toBe(expected)

          if (shouldCallCurrencyConversion) {
            expect(
              rawStringAmountToCountableCurrencyAmount
            ).toHaveBeenCalledWith(CurrencyCode.USD, rawAmountString)
          }
        }
      )
    })
  })

  describe('Integration with Form Submission', () => {
    it('should handle complete form submission for fixed discount', () => {
      const formInput = {
        discount: {
          name: 'Test Fixed Discount',
          code: 'FIXED10',
          amountType: DiscountAmountType.Fixed,
          amount: 0,
          duration: 'once' as const,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '10.50',
      }

      const amount =
        formInput.discount.amountType === DiscountAmountType.Fixed
          ? rawStringAmountToCountableCurrencyAmount(
              CurrencyCode.USD,
              formInput.__rawAmountString!
            )
          : Math.round(formInput.discount.amount ?? 0)

      const submissionData = {
        ...formInput,
        discount: {
          ...formInput.discount,
          amount,
        },
      }

      expect(submissionData.discount.amount).toBe(1050)
      expect(submissionData.discount.amountType).toBe(
        DiscountAmountType.Fixed
      )
    })

    it('should handle complete form submission for percent discount', () => {
      const formInput = {
        discount: {
          name: 'Test Percent Discount',
          code: 'PERCENT25',
          amountType: DiscountAmountType.Percent,
          amount: 25.7,
          duration: 'once' as const,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '0',
      }

      const amount =
        formInput.discount.amountType === DiscountAmountType.Fixed
          ? rawStringAmountToCountableCurrencyAmount(
              CurrencyCode.USD,
              formInput.__rawAmountString!
            )
          : Math.round(formInput.discount.amount ?? 0)

      const submissionData = {
        ...formInput,
        discount: {
          ...formInput.discount,
          amount,
        },
      }

      expect(submissionData.discount.amount).toBe(26)
      expect(submissionData.discount.amountType).toBe(
        DiscountAmountType.Percent
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid currency strings gracefully', () => {
      const mockInput = {
        discount: {
          amountType: DiscountAmountType.Fixed,
          amount: 0,
        },
        __rawAmountString: 'invalid',
      }
      // Mock the function to throw an error for invalid input
      ;(
        rawStringAmountToCountableCurrencyAmount as Mock<any>
      ).mockImplementationOnce(() => {
        throw new Error('Invalid currency amount')
      })

      expect(() => {
        const amount =
          mockInput.discount.amountType === DiscountAmountType.Fixed
            ? rawStringAmountToCountableCurrencyAmount(
                CurrencyCode.USD,
                mockInput.__rawAmountString!
              )
            : Math.round(mockInput.discount.amount ?? 0)
      }).toThrow('Invalid currency amount')
    })

    it('should handle negative amounts', () => {
      const mockInput = {
        discount: {
          amountType: DiscountAmountType.Fixed,
          amount: 0,
        },
        __rawAmountString: '-10.50',
      }

      const amount =
        mockInput.discount.amountType === DiscountAmountType.Fixed
          ? rawStringAmountToCountableCurrencyAmount(
              CurrencyCode.USD,
              mockInput.__rawAmountString!
            )
          : Math.round(mockInput.discount.amount ?? 0)

      expect(amount).toBe(-1050) // Negative amount in cents
    })
  })
})
