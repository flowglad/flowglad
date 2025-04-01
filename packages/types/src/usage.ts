import { Flowglad } from '@flowglad/node'

export type UsageMeter =
  Flowglad.CustomerRetrieveBillingResponse.Catalog.UsageMeter

export type UsageEvent =
  Flowglad.UsageEvents.UsageEventRetrieveResponse['usageEvent']
