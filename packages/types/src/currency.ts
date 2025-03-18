import { type Flowglad } from '@flowglad/node'

export type CurrencyCode =
  Flowglad.CustomerRetrieveBillingResponse.Catalog.Product.SinglePaymentPrice['currency']
