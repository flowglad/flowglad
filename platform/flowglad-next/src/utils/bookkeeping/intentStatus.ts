import { DbTransaction } from '@/db/types'
import {
  selectCheckoutSessionById,
  selectCheckoutSessions,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PaymentStatus,
  SubscriptionStatus,
} from '@/types'
import { getSetupIntent, stripeIdFromObjectOrId } from '../stripe'
import { paymentMethodForStripePaymentMethodId } from '../paymentMethodHelpers'
import {
  PaymentMethod,
  paymentMethodClientSelectSchema,
} from '@/db/schema/paymentMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import {
  checkoutSessionClientSelectSchema,
  GetIntentStatusInput,
} from '@/db/schema/checkoutSessions'
import { z } from 'zod'

export const getCheckoutSessionIntentStatus = async (
  checkoutSessionId: string,
  transaction: DbTransaction
): Promise<z.infer<typeof getCheckoutSessionIntentStatusOutput>> => {
  const checkoutSession = await selectCheckoutSessionById(
    checkoutSessionId,
    transaction
  )
  if (!checkoutSession) {
    throw new Error(
      `Checkout session not found for checkout session id ${checkoutSessionId}`
    )
  }
  return {
    type: 'checkoutSession',
    checkoutSession: checkoutSession,
    status: checkoutSession.status,
  }
}

export async function getSetupIntentStatus(
  setupIntentId: string,
  transaction: DbTransaction
): Promise<z.infer<typeof getSetupIntentIntentStatusOutput>> {
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
    return {
      type: 'setupIntent',
      setupIntentId: setupIntentId,
      checkoutSession: checkoutSession,
      status: null,
      paymentMethod: paymentMethod,
    }
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
    return {
      type: 'setupIntent',
      setupIntentId: setupIntentId,
      checkoutSession: checkoutSession,
      status: subscription.status,
      paymentMethod: null,
    }
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
): Promise<z.infer<typeof getPaymentIntentIntentStatusOutput>> => {
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
  return {
    type: 'paymentIntent',
    paymentIntentId: paymentIntentId,
    checkoutSession: checkoutSessions[0],
    status: payment.status,
  }
}

export const getCheckoutSessionIntentStatusOutput = z.object({
  type: z.literal('checkoutSession'),
  checkoutSession: checkoutSessionClientSelectSchema,
  status: z.nativeEnum(CheckoutSessionStatus),
})

export type GetCheckoutSessionIntentStatusOutput = z.infer<
  typeof getCheckoutSessionIntentStatusOutput
>

export const getPaymentIntentIntentStatusOutput = z.object({
  type: z.literal('paymentIntent'),
  paymentIntentId: z.string(),
  checkoutSession: checkoutSessionClientSelectSchema,
  status: z.nativeEnum(PaymentStatus),
})

export type GetPaymentIntentIntentStatusOutput = z.infer<
  typeof getPaymentIntentIntentStatusOutput
>

export const getSetupIntentIntentStatusOutput = z.object({
  type: z.literal('setupIntent'),
  setupIntentId: z.string(),
  checkoutSession: checkoutSessionClientSelectSchema,
  status: z.nativeEnum(SubscriptionStatus).nullish(),
  paymentMethod: paymentMethodClientSelectSchema.nullish(),
})

export type GetSetupIntentIntentStatusOutput = z.infer<
  typeof getSetupIntentIntentStatusOutput
>

export const getIntentStatusOutput = z.discriminatedUnion('type', [
  getCheckoutSessionIntentStatusOutput,
  getPaymentIntentIntentStatusOutput,
  getSetupIntentIntentStatusOutput,
])

export type GetIntentStatusOutput = z.infer<
  typeof getIntentStatusOutput
>

export const getIntentStatus = async (
  params: GetIntentStatusInput,
  transaction: DbTransaction
): Promise<z.infer<typeof getIntentStatusOutput>> => {
  if (params.type === 'paymentIntent') {
    return getPaymentIntentStatus(params.paymentIntentId, transaction)
  } else if (params.type === 'setupIntent') {
    return getSetupIntentStatus(params.setupIntentId, transaction)
  } else if (params.type === 'checkoutSession') {
    return getCheckoutSessionIntentStatus(
      params.checkoutSessionId,
      transaction
    )
  } else {
    throw new Error(`Unsupported intent params: ${params}`)
  }
}
