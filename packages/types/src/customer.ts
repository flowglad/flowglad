import type { Flowglad } from '@flowglad/node'

export type Customer = Flowglad.CustomerRetrieveResponse['customer']

export type CustomerBillingDetails =
  Flowglad.Customers.CustomerRetrieveBillingResponse
