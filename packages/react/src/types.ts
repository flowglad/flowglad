import type Flowglad from '@flowglad/node'

import type { Subscription } from '@flowglad/shared'

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
  Flowglad.StandardSubscriptionDetails.SubscriptionItem,
  'id' | 'unitPrice' | 'quantity' | 'price'
>
