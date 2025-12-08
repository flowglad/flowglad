import { type Flowglad } from '@flowglad/node'

export type Subscription =
  | Flowglad.StandardSubscriptionRecord
  | Flowglad.NonRenewingSubscriptionRecord

export type SubscriptionItem =
  | Flowglad.NonRenewingSubscriptionDetails.SubscriptionItem
  | Flowglad.StandardSubscriptionDetails.SubscriptionItem

export type SubscriptionStatus =
  | Flowglad.StandardSubscriptionRecord['status']
  | Flowglad.NonRenewingSubscriptionRecord['status']

export type SubscriptionIntervalUnit =
  Flowglad.StandardSubscriptionRecord['interval']

export type SubscriptionDetails =
  Flowglad.CustomerRetrieveBillingResponse['subscriptions'][number]

export type SubscriptionExperimentalFields =
  | Flowglad.NonRenewingSubscriptionDetails.Experimental
  | Flowglad.StandardSubscriptionDetails.Experimental
