import type { Flowglad } from '@flowglad/node'

// NOTE: some checkout types are duplicate of types in action.ts
// currently a consumer that imports these types will get the ones from actions.ts
// as those are named exports in index.ts
// we may want to deduplicate these types in the future
/**
 * Base fields shared by all product checkout session variants
 */
type BaseProductCheckoutSessionFields = {
  successUrl: string
  cancelUrl: string
  quantity?: number // defaults to 1 if not provided
  outputMetadata?: Record<string, string>
  outputName?: string
}

/**
 * Product checkout session using price ID
 */
export type ProductCheckoutSessionWithPriceId =
  BaseProductCheckoutSessionFields & {
    priceId: string
    priceSlug?: never
  }

/**
 * Product checkout session using price slug
 */
export type ProductCheckoutSessionWithPriceSlug =
  BaseProductCheckoutSessionFields & {
    priceSlug: string
    priceId?: never
  }

/**
 * Create product checkout session params - accepts either priceId or priceSlug
 * Note: Exactly one of priceId or priceSlug must be provided
 */
export type CreateProductCheckoutSessionParams =
  | ProductCheckoutSessionWithPriceId
  | ProductCheckoutSessionWithPriceSlug

export type CreateActivateSubscriptionCheckoutSessionParams =
  BaseProductCheckoutSessionFields & {
    targetSubscriptionId: string
    priceId: string
  }

export type CreateAddPaymentMethodCheckoutSessionParams =
  BaseProductCheckoutSessionFields & {
    targetSubscriptionId?: string
  }

export type CheckoutSessionType =
  Flowglad.CheckoutSessions.CheckoutSessionCreateParams['checkoutSession']['type']
