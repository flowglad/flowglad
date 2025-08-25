import Flowglad from '@flowglad/node'

import { Subscription } from '@flowglad/types'

export type SubscriptionCardSubscription = Pick<
  Subscription,
  | 'id'
  | 'trialEnd'
  | 'status'
  | 'cancelScheduledAt'
  | 'currentBillingPeriodEnd'
  | 'interval'
  | 'intervalCount'
  | 'canceledAt'
>

export type SubscriptionCardSubscriptionItem = Pick<
  Flowglad.CustomerRetrieveBillingResponse.SubscriptionItem.StaticSubscriptionItem,
  'id' | 'unitPrice' | 'quantity' | 'price'
>
