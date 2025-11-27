import type Flowglad from '@flowglad/node'

import type { Subscription } from '@flowglad/types'

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
