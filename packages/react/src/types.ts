import { SubscriptionItem } from '@flowglad/types'

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
  SubscriptionItem,
  'id' | 'unitPrice' | 'quantity'
>
