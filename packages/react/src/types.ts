import Flowglad from '@flowglad/node'

import { Subscription } from '@flowglad/shared'

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
  Flowglad.CustomerRetrieveBillingResponse.StandardSubscriptionDetails.SubscriptionItem,
  'id' | 'unitPrice' | 'quantity' | 'price'
>
