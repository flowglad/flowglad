import type Flowglad from '@flowglad/node'

import type { Subscription } from '@flowglad/shared'

export interface FlowgladError {
  message: string
  status?: number
  code?: string
}

export interface FlowgladHookData<TData, TRefetchParams = void> {
  data: TData | null
  isPending: boolean
  isRefetching: boolean
  error: FlowgladError | null
  refetch: (params?: TRefetchParams) => void
}

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
