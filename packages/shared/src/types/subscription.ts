import { type Flowglad } from '@flowglad/node'

export type Subscription =
  | Flowglad.StandardSubscriptionRecord
  | Flowglad.NonRenewingSubscriptionRecord

export type SubscriptionItem =
  | Flowglad.CustomerRetrieveBillingResponse.NonRenewingSubscriptionDetails.SubscriptionItem
  | Flowglad.CustomerRetrieveBillingResponse.StandardSubscriptionDetails.SubscriptionItem

export type SubscriptionStatus =
  | Flowglad.StandardSubscriptionRecord['status']
  | Flowglad.NonRenewingSubscriptionRecord['status']

export type SubscriptionIntervalUnit =
  Flowglad.StandardSubscriptionRecord['interval']

export type SubscriptionDetails =
  Flowglad.CustomerRetrieveBillingResponse['subscriptions'][number]

export type SubscriptionExperimentalFields =
  | Flowglad.CustomerRetrieveBillingResponse.NonRenewingSubscriptionDetails.Experimental
  | Flowglad.CustomerRetrieveBillingResponse.StandardSubscriptionDetails.Experimental
