import { describe, expect, it } from 'bun:test'
import { DiscountAmountType, DiscountDuration } from '@db-core/enums'
import {
  createDiscountFormSchema,
  editDiscountFormSchema,
} from '@db-core/schema/discounts'

describe('Discount Form Validation', () => {
  describe('Create Discount Form Schema', () => {
    it('should validate fixed discount with valid data', () => {
      const validFixedDiscount = {
        discount: {
          name: 'Test Discount',
          code: 'TEST10',
          amountType: DiscountAmountType.Fixed,
          amount: 0,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '10.50',
      }

      const result = createDiscountFormSchema.safeParse(
        validFixedDiscount
      )
      expect(result.success).toBe(true)
    })

    it('should validate percent discount with valid data', () => {
      const validPercentDiscount = {
        discount: {
          name: 'Percent Discount',
          code: 'PERCENT25',
          amountType: DiscountAmountType.Percent,
          amount: 25,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
      }

      const result = createDiscountFormSchema.safeParse(
        validPercentDiscount
      )
      expect(result.success).toBe(true)
    })

    it('should validate recurring discount with valid data', () => {
      const validRecurringDiscount = {
        discount: {
          name: 'Recurring Discount',
          code: 'RECURRING5',
          amountType: DiscountAmountType.Percent,
          amount: 5,
          duration: DiscountDuration.NumberOfPayments,
          active: true,
          numberOfPayments: 3,
        },
      }

      const result = createDiscountFormSchema.safeParse(
        validRecurringDiscount
      )
      expect(result.success).toBe(true)
    })

    it('should validate forever discount with valid data', () => {
      const validForeverDiscount = {
        discount: {
          name: 'Forever Discount',
          code: 'FOREVER10',
          amountType: DiscountAmountType.Percent,
          amount: 10,
          duration: DiscountDuration.Forever,
          active: true,
          numberOfPayments: null,
        },
      }

      const result = createDiscountFormSchema.safeParse(
        validForeverDiscount
      )
      expect(result.success).toBe(true)
    })
  })

  describe('Edit Discount Form Schema', () => {
    it('should validate edit discount with valid data', () => {
      const validEditDiscount = {
        discount: {
          name: 'Updated Discount',
          code: 'UPDATED10',
          amountType: DiscountAmountType.Fixed,
          // amount omitted for fixed branch
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '15.75',
        id: 'discount_123',
      }

      const result =
        editDiscountFormSchema.safeParse(validEditDiscount)
      expect(result.success).toBe(true)
    })

    it('should require id field for edit discount', () => {
      const invalidEditDiscount = {
        discount: {
          name: 'Updated Discount',
          code: 'UPDATED10',
          amountType: DiscountAmountType.Fixed,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '15.75',
      } as any

      const result = editDiscountFormSchema.safeParse(
        invalidEditDiscount
      )
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(
          result.error.issues.some((issue) =>
            issue.path.includes('id')
          )
        ).toBe(true)
      }
    })
  })

  describe('Code Validation', () => {
    it('should transform code to uppercase', () => {
      const discountWithLowercaseCode = {
        discount: {
          name: 'Test Discount',
          code: 'test10',
          amountType: DiscountAmountType.Fixed,
          amount: 0,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '10.50',
      }

      const result = createDiscountFormSchema.safeParse(
        discountWithLowercaseCode
      )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.discount.code).toBe('TEST10')
      }
    })

    it('should validate code length requirements', () => {
      const testCases = [
        {
          code: 'AB',
          valid: false,
          description: 'too short (2 chars)',
        },
        {
          code: 'ABC',
          valid: true,
          description: 'minimum length (3 chars)',
        },
        {
          code: 'ABCDEFGHIJKLMNOPQRST',
          valid: true,
          description: 'maximum length (20 chars)',
        },
        {
          code: 'ABCDEFGHIJKLMNOPQRSTU',
          valid: false,
          description: 'too long (21 chars)',
        },
      ]

      testCases.forEach(({ code, valid, description }) => {
        const discountWithCode = {
          discount: {
            name: 'Test Discount',
            code,
            amountType: DiscountAmountType.Fixed,
            amount: 0,
            duration: DiscountDuration.Once,
            active: true,
            numberOfPayments: null,
          },
          __rawAmountString: '10.50',
        }

        const result =
          createDiscountFormSchema.safeParse(discountWithCode)
        expect(result.success).toBe(valid)
      })
    })
  })

  describe('Amount Validation', () => {
    it('should validate positive integer amounts', () => {
      const testCases = [
        { amount: 0, valid: false, description: 'zero amount' },
        {
          amount: 1,
          valid: true,
          description: 'minimum positive amount',
        },
        { amount: 100, valid: true, description: 'valid amount' },
        { amount: -1, valid: false, description: 'negative amount' },
        { amount: 1.5, valid: false, description: 'decimal amount' },
      ]

      testCases.forEach(({ amount, valid, description }) => {
        const discountWithAmount = {
          discount: {
            name: 'Test Discount',
            code: 'TEST10',
            amountType: DiscountAmountType.Percent,
            amount,
            duration: DiscountDuration.Once,
            active: true,
            numberOfPayments: null,
          },
        }

        const result = createDiscountFormSchema.safeParse(
          discountWithAmount
        )
        expect(result.success).toBe(valid)
      })
    })
  })

  describe('Duration Validation', () => {
    it('should validate duration-specific requirements', () => {
      const testCases = [
        {
          duration: DiscountDuration.Once,
          numberOfPayments: null,
          valid: true,
          description: 'once duration with null numberOfPayments',
        },
        {
          duration: DiscountDuration.Forever,
          numberOfPayments: null,
          valid: true,
          description: 'forever duration with null numberOfPayments',
        },
        {
          duration: DiscountDuration.NumberOfPayments,
          numberOfPayments: 3,
          valid: true,
          description:
            'number of payments duration with valid numberOfPayments',
        },
        {
          duration: DiscountDuration.NumberOfPayments,
          numberOfPayments: null,
          valid: false,
          description:
            'number of payments duration with null numberOfPayments',
        },
        {
          duration: DiscountDuration.Once,
          numberOfPayments: 3,
          valid: false,
          description: 'once duration with numberOfPayments',
        },
      ]

      testCases.forEach(
        ({ duration, numberOfPayments, valid, description }) => {
          const discountWithDuration = {
            discount: {
              name: 'Test Discount',
              code: 'TEST10',
              amountType: DiscountAmountType.Percent,
              amount: 10,
              duration,
              active: true,
              numberOfPayments,
            },
          }

          const result = createDiscountFormSchema.safeParse(
            discountWithDuration
          )
          expect(result.success).toBe(valid)
        }
      )
    })
  })

  describe('Required Fields Validation', () => {
    it('should require all essential fields', () => {
      const testCases = [
        { field: 'code', value: '', valid: false },
        { field: 'amountType', value: null, valid: false },
        { field: 'duration', value: null, valid: false },
        { field: 'active', value: null, valid: false },
      ]

      testCases.forEach(({ field, value, valid }) => {
        const discountWithMissingField = {
          discount: {
            name: 'Test Discount',
            code: 'TEST10',
            amountType: DiscountAmountType.Fixed,
            amount: 0,
            duration: DiscountDuration.Once,
            active: true,
            numberOfPayments: null,
            [field]: value,
          },
          __rawAmountString: '10.50',
        }

        const result = createDiscountFormSchema.safeParse(
          discountWithMissingField
        )
        expect(result.success).toBe(valid)
      })
    })
  })

  describe('Raw Amount String Validation', () => {
    it('should validate raw amount string format', () => {
      const testCases = [
        {
          rawAmountString: '0',
          valid: true,
          description: 'zero amount',
        },
        {
          rawAmountString: '10.50',
          valid: true,
          description: 'decimal amount',
        },
        {
          rawAmountString: '100',
          valid: true,
          description: 'whole number amount',
        },
        {
          rawAmountString: '',
          valid: false,
          description: 'empty string',
        },
        {
          rawAmountString: 'invalid',
          valid: false,
          description: 'non-numeric string',
        },
      ]

      testCases.forEach(({ rawAmountString, valid, description }) => {
        const discountWithRawAmount = {
          discount: {
            name: 'Test Discount',
            code: 'TEST10',
            amountType: DiscountAmountType.Fixed,
            amount: 0,
            duration: DiscountDuration.Once,
            active: true,
            numberOfPayments: null,
          },
          __rawAmountString: rawAmountString,
        }

        const result = createDiscountFormSchema.safeParse(
          discountWithRawAmount
        )
        expect(result.success).toBe(valid)
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle boundary values correctly', () => {
      const boundaryTestCases = [
        {
          name: 'minimum code length',
          code: 'ABC',
          valid: true,
        },
        {
          name: 'maximum code length',
          code: 'ABCDEFGHIJKLMNOPQRST',
          valid: true,
        },
        {
          name: 'minimum amount',
          amount: 1,
          valid: true,
        },
        {
          name: 'maximum numberOfPayments',
          numberOfPayments: 10000000000,
          valid: true,
        },
      ]

      boundaryTestCases.forEach(
        ({ name, code, amount, numberOfPayments, valid }) => {
          const discountWithBoundaryValues = {
            discount: {
              name: 'Test Discount',
              code: code || 'TEST10',
              amountType: DiscountAmountType.Percent,
              amount: amount || 10,
              duration: numberOfPayments
                ? DiscountDuration.NumberOfPayments
                : DiscountDuration.Once,
              active: true,
              numberOfPayments: numberOfPayments || null,
            },
          }

          const result = createDiscountFormSchema.safeParse(
            discountWithBoundaryValues
          )
          expect(result.success).toBe(valid)
        }
      )
    })
  })
})
