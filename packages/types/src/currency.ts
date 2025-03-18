import { type Flowglad } from '@flowglad/node'

export type CurrencyCode =
  Flowglad.CustomerProfileRetrieveBillingResponse.Catalog.Product.SinglePaymentPrice['currency']
