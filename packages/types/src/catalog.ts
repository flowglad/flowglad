import { type Flowglad } from '@flowglad/node'

export type Catalog =
  Flowglad.CustomerProfileRetrieveBillingResponse['catalog']

export type Product =
  Flowglad.CustomerProfileRetrieveBillingResponse.Catalog.Product.Product

export type SinglePaymentPrice =
  Flowglad.CustomerProfileRetrieveBillingResponse.Catalog.Product.SinglePaymentPrice

export type SubscriptionPrice =
  Flowglad.CustomerProfileRetrieveBillingResponse.Catalog.Product.SubscriptionPrice

export type Price = SinglePaymentPrice | SubscriptionPrice
