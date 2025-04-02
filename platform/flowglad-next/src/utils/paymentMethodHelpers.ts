import { PaymentMethodType } from '@/types'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { DbTransaction } from '@/db/types'
import { getStripePaymentMethod } from '@/utils/stripe'
import {
  safelyInsertPaymentMethod,
  selectPaymentMethods,
} from '@/db/tableMethods/paymentMethodMethods'
import { titleCase } from '@/utils/core'
export const paymentMethodForStripePaymentMethodId = async (
  {
    stripePaymentMethodId,
    livemode,
    customerId,
  }: {
    stripePaymentMethodId: string
    livemode: boolean
    customerId: string
  },
  transaction: DbTransaction
): Promise<PaymentMethod.Record> => {
  const stripePaymentMethod = await getStripePaymentMethod(
    stripePaymentMethodId,
    livemode
  )
  let paymentMethod: PaymentMethod.Record | null = null
  const [existingPaymentMethod] = await selectPaymentMethods(
    {
      stripePaymentMethodId,
    },
    transaction
  )
  if (existingPaymentMethod) {
    paymentMethod = existingPaymentMethod
  } else {
    const paymentMethodInsert: PaymentMethod.Insert = {
      type: PaymentMethodType.Card,
      livemode,
      customerId,
      externalId: null,
      billingDetails: {
        name: stripePaymentMethod.billing_details?.name,
        email: stripePaymentMethod.billing_details?.email,
        address: {
          name: stripePaymentMethod.billing_details?.name ?? '',
          address: stripePaymentMethod.billing_details?.address,
        },
      },
      /**
       * For now, assume that the most recently added payment method is the
       * default.
       */
      default: true,
      stripePaymentMethodId,
      /**
       * Stripe payment method objects are not serializable, so we need to
       * stringify and parse them to get a JSON object.
       */
      paymentMethodData: JSON.parse(
        JSON.stringify(stripePaymentMethod.card ?? {})
      ),
      metadata: {},
    }

    paymentMethod = await safelyInsertPaymentMethod(
      paymentMethodInsert,
      transaction
    )
  }
  return paymentMethod
}

export const paymentMethodSummaryLabel = (
  paymentMethod: PaymentMethod.Record
) => {
  switch (paymentMethod.type) {
    case PaymentMethodType.Card:
      return `${titleCase(paymentMethod.paymentMethodData.brand as string)} ending in ${paymentMethod.paymentMethodData.last4}`
    case PaymentMethodType.USBankAccount:
      return `Bank account ending in ${paymentMethod.paymentMethodData.last4}`
    default:
      return titleCase(paymentMethod.type)
  }
}
