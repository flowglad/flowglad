import type { Flowglad } from '@flowglad/node'

export type PricingModel =
  Flowglad.CustomerRetrieveBillingResponse['pricingModel']

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
