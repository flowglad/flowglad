import { describe, expect, it, mock, spyOn } from 'bun:test'
import {
  type CreateDiscountFormSchema,
  createDiscountInputSchema,
  type EditDiscountFormSchema,
  editDiscountInputSchema,
} from '@/db/schema/discounts'
import {
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
} from '@/types'
import {
  normalizeDiscountAmount,
  toCreateDiscountInput,
  toEditDiscountInput,
} from './discountFormHelpers'

mock.module('@/utils/stripe', () => ({
  rawStringAmountToCountableCurrencyAmount: mock(
    (currency: string, amt: string) =>
      Math.round(parseFloat(amt) * 100)
  ),
}))

describe('discountFormHelpers', () => {
  const currency = CurrencyCode.USD

  describe('normalizeDiscountAmount', () => {
    it('converts fixed raw string to countable amount', () => {
      const form = {
        discount: {
          name: 'Test',
          code: 'CODE10',
          amountType: DiscountAmountType.Fixed,
          amount: 0,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '10.50',
      } as unknown as CreateDiscountFormSchema

      const result = normalizeDiscountAmount(form, currency)
      expect(result).toBe(1050)
    })

    it('rounds percent amount to integer', () => {
      const form = {
        discount: {
          name: 'Test',
          code: 'CODE25',
          amountType: DiscountAmountType.Percent,
          amount: 25.7,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '0',
      } as unknown as CreateDiscountFormSchema

      const result = normalizeDiscountAmount(form, currency)
      expect(result).toBe(26)
    })
  })

  describe('toCreateDiscountInput', () => {
    it('builds schema-valid payload for fixed amount', () => {
      const form: CreateDiscountFormSchema = {
        discount: {
          name: 'Test',
          code: 'CODE',
          amountType: DiscountAmountType.Fixed,
          amount: 0,
          duration: DiscountDuration.Once,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '0.99',
      }

      const input = toCreateDiscountInput(form, currency)
      expect(createDiscountInputSchema.safeParse(input).success).toBe(
        true
      )
      expect(input.discount.amount).toBe(99)
    })

    it('builds schema-valid payload for percent amount', () => {
      const form: CreateDiscountFormSchema = {
        discount: {
          name: 'Percent',
          code: 'P25',
          amountType: DiscountAmountType.Percent,
          amount: 25,
          duration: DiscountDuration.Forever,
          active: true,
          numberOfPayments: null,
        },
        __rawAmountString: '0',
      }

      const input = toCreateDiscountInput(form, currency)
      expect(createDiscountInputSchema.safeParse(input).success).toBe(
        true
      )
      expect(input.discount.amount).toBe(25)
    })
  })

  describe('toEditDiscountInput', () => {
    it('builds schema-valid payload for edit', () => {
      const form: EditDiscountFormSchema = {
        id: 'disc_1',
        discount: {
          id: 'disc_1',
          name: 'Edit',
          code: 'EDIT',
          amountType: DiscountAmountType.Fixed,
          amount: 0,
          duration: DiscountDuration.NumberOfPayments,
          numberOfPayments: 3,
          active: true,
        },
        __rawAmountString: '5.00',
      }

      const input = toEditDiscountInput(form, currency)
      expect(editDiscountInputSchema.safeParse(input).success).toBe(
        true
      )
      expect(input.discount.amount).toBe(500)
      expect(input.id).toBe('disc_1')
    })
  })
})
