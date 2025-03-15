import { Flowglad } from '@flowglad/node'

export type CustomerProfile =
  Flowglad.CustomerProfileRetrieveResponse['customerProfile']

export type CustomerProfileBillingDetails =
  Flowglad.CustomerProfiles.CustomerProfileRetrieveBillingResponse
