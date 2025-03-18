import { type Flowglad } from '@flowglad/node'

export type Catalog =
  Flowglad.CustomerRetrieveBillingResponse['catalog']

export type Product =
  Flowglad.CustomerRetrieveBillingResponse.Catalog.Product.Product

export type SinglePaymentPrice =
  Flowglad.CustomerRetrieveBillingResponse.Catalog.Product.SinglePaymentPrice

export type SubscriptionPrice =
  Flowglad.CustomerRetrieveBillingResponse.Catalog.Product.SubscriptionPrice

export type Price = SinglePaymentPrice | SubscriptionPrice
