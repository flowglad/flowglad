import { type Flowglad } from '@flowglad/node'

export type Subscription =
  Flowglad.Subscriptions.SubscriptionRetrieveResponse

export type SubscriptionItem =
  Flowglad.CustomerRetrieveBillingResponse.Subscription.SubscriptionItem

export type SubscriptionStatus =
  Flowglad.Subscriptions.SubscriptionRetrieveResponse.Subscription['status']

export type SubscriptionIntervalUnit =
  Flowglad.Subscriptions.SubscriptionRetrieveResponse.Subscription['interval']
