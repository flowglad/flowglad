import { DbTransaction } from '@/db/types'
import {
  selectCheckoutSessionById,
  selectCheckoutSessions,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import {
  CheckoutSessionType,
  PaymentStatus,
  SubscriptionStatus,
} from '@/types'
import { getSetupIntent, stripeIdFromObjectOrId } from '../stripe'
import { paymentMethodForStripePaymentMethodId } from '../paymentMethodHelpers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'

export const getCheckoutSessionIntentStatus = async (
  checkoutSessionId: string,
  transaction: DbTransaction
) => {
  const checkoutSession = await selectCheckoutSessionById(
    checkoutSessionId,
    transaction
  )
}

export async function getSetupIntentStatus(
  setupIntentId: string,
  transaction: DbTransaction
): Promise<PaymentMethod.Record | SubscriptionStatus> {
  const [checkoutSession] = await selectCheckoutSessions(
    {
      stripeSetupIntentId: setupIntentId,
    },
    transaction
  )
  if (!checkoutSession) {
    throw new Error(
      `Checkout session not found for setup intent ${setupIntentId}`
    )
  }
  const setupIntent = await getSetupIntent(setupIntentId)
  if (checkoutSession.type === CheckoutSessionType.AddPaymentMethod) {
    const stripePaymentMethodId = stripeIdFromObjectOrId(
      setupIntent.payment_method!
    )
    const paymentMethod = await paymentMethodForStripePaymentMethodId(
      {
        stripePaymentMethodId,
        livemode: checkoutSession.livemode,
        customerId: checkoutSession.customerId,
      },
      transaction
    )
    return paymentMethod
  } else if (
    checkoutSession.type === CheckoutSessionType.Product ||
    checkoutSession.type === CheckoutSessionType.Purchase
  ) {
    const [subscription] = await selectSubscriptions(
      {
        stripeSetupIntentId: setupIntentId,
      },
      transaction
    )
    if (!subscription) {
      throw new Error(
        `Subscription not found for setup intent ${setupIntentId}`
      )
    }
    return subscription.status
  } else if (checkoutSession.type === CheckoutSessionType.Invoice) {
    throw new Error(
      `Invoice checkout sessions are not supported for setup intents`
    )
  } else {
    throw new Error(
      `Checkout session type ${checkoutSession} not supported`
    )
  }
}

export const getPaymentIntentStatus = async (
  paymentIntentId: string,
  transaction: DbTransaction
): Promise<PaymentStatus> => {
  const checkoutSessions = await selectCheckoutSessions(
    {
      stripePaymentIntentId: paymentIntentId,
    },
    transaction
  )
  if (checkoutSessions.length === 0) {
    throw new Error(
      `Checkout session not found for payment intent ${paymentIntentId}`
    )
  }
  const [payment] = await selectPayments(
    {
      stripePaymentIntentId: paymentIntentId,
    },
    transaction
  )
  if (!payment) {
    throw new Error(
      `Payment not found for payment intent ${paymentIntentId}`
    )
  }
  return payment.status
}
