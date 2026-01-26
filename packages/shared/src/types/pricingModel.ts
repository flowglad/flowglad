import type { Flowglad } from '@flowglad/node'

export type PricingModel =
  Flowglad.CustomerRetrieveBillingResponse['pricingModel']

/**
 * @deprecated Use `PricingModel` instead. This type alias is kept for backward compatibility.
 */
export type Catalog = PricingModel

/**
 * Standard response shape for GetPricingModel endpoint.
 * Both authenticated and unauthenticated paths MUST return this exact shape.
 */
export interface GetPricingModelResponse {
  pricingModel: PricingModel
  source: 'customer' | 'default'
}

export type Product = Flowglad.ProductRetrieveResponse

export type SinglePaymentPrice =
  Flowglad.SinglePaymentPriceClientSelectSchema

export type SubscriptionPrice =
  Flowglad.SubscriptionPriceClientSelectSchema

export type UsagePrice = Flowglad.UsagePriceClientSelectSchema

export type Price =
  | SinglePaymentPrice
  | SubscriptionPrice
  | UsagePrice
