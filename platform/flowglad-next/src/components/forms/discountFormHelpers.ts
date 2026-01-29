import { type CurrencyCode, DiscountAmountType } from '@db-core/enums'
import {
  type CreateDiscountFormSchema,
  type CreateDiscountInput,
  createDiscountInputSchema,
  type EditDiscountFormSchema,
  type EditDiscountInput,
  editDiscountInputSchema,
} from '@/db/schema/discounts'
import { rawStringAmountToCountableCurrencyAmount } from '@/utils/stripe'

export function normalizeDiscountAmount(
  form: {
    discount: {
      amountType?: DiscountAmountType
      amount?: number | null | undefined
    }
    __rawAmountString?: string | null
  },
  currency: CurrencyCode
): number {
  const amountType =
    form.discount.amountType ?? DiscountAmountType.Fixed
  if (amountType === DiscountAmountType.Fixed) {
    return rawStringAmountToCountableCurrencyAmount(
      currency,
      form.__rawAmountString || '0'
    )
  }
  // For Percent, avoid silent fallback to 0; coerce to number and let schema catch invalids
  const coerced = Number((form.discount as any).amount)
  return Math.round(coerced)
}

export function toCreateDiscountInput(
  form: CreateDiscountFormSchema,
  currency: CurrencyCode
): CreateDiscountInput {
  const amount = normalizeDiscountAmount(
    {
      discount: {
        amountType: form.discount.amountType,
        amount: (form.discount as any).amount ?? null,
      },
      __rawAmountString: form.__rawAmountString,
    },
    currency
  )
  const input: CreateDiscountInput = {
    discount: {
      ...form.discount,
      amount,
    },
  }
  // Validate to ensure schema-compat output (throws on failure)
  createDiscountInputSchema.parse(input)
  return input
}

export function toEditDiscountInput(
  form: EditDiscountFormSchema,
  currency: CurrencyCode
): EditDiscountInput {
  const amount = normalizeDiscountAmount(
    {
      discount: {
        amountType: form.discount.amountType,
        amount: (form.discount as any).amount ?? null,
      },
      __rawAmountString: form.__rawAmountString,
    },
    currency
  )
  const input: EditDiscountInput = {
    id: form.id,
    discount: {
      ...form.discount,
      id: (form.discount as any)?.id ?? form.id,
      amount,
    },
  }
  editDiscountInputSchema.parse(input)
  return input
}
