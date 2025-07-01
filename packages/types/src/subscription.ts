import { type Flowglad } from '@flowglad/node'

export type Subscription =
  Flowglad.Subscriptions.SubscriptionRetrieveResponse['subscription']

export type SubscriptionItem =
  | Flowglad.CustomerRetrieveBillingResponse.SubscriptionItem.StaticSubscriptionItem
  | Flowglad.CustomerRetrieveBillingResponse.SubscriptionItem.UsageSubscriptionItem

export type SubscriptionStatus =
  Flowglad.Subscriptions.SubscriptionRetrieveResponse.Subscription['status']

export type SubscriptionIntervalUnit =
  Flowglad.Subscriptions.SubscriptionRetrieveResponse.Subscription['interval']

export type SubscriptionDetails =
  Flowglad.CustomerRetrieveBillingResponse['subscriptions'][number]

export type SubscriptionExperimentalFields =
  Flowglad.CustomerRetrieveBillingResponse.SubscriptionItem.Experimental
