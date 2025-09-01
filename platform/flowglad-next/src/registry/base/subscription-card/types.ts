export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'trialing'

export interface SubscriptionItem {
  id: string
  priceId: string
  productId: string
  productName: string
  quantity: number
  unitAmount: number
  currency: string
  interval?: 'month' | 'year' | 'week' | 'day'
  intervalCount?: number
  usageType?: 'metered' | 'licensed'
}

export interface Subscription {
  id: string
  name: string
  status: SubscriptionStatus
  currentPeriodEnd: Date
  currentPeriodStart: Date
  cancelAtPeriodEnd: boolean
  canceledAt?: Date
  trialEnd?: Date
  items: SubscriptionItem[]
  currency?: string
  defaultPaymentMethodId?: string
}

export interface SubscriptionCardProps {
  subscription: Subscription
  onCancel?: (subscriptionId: string) => Promise<void>
  onReactivate?: (subscriptionId: string) => Promise<void>
  loading?: boolean
  className?: string
}

export interface SubscriptionHeaderProps {
  name: string
  status: SubscriptionStatus
  trialEnd?: Date
  className?: string
}

export interface SubscriptionDetailsProps {
  subscription: Subscription
  className?: string
}

export interface SubscriptionActionsProps {
  subscriptionId: string
  status: SubscriptionStatus
  cancelAtPeriodEnd: boolean
  onCancel?: (subscriptionId: string) => Promise<void>
  onReactivate?: (subscriptionId: string) => Promise<void>
  loading?: boolean
  className?: string
}

export interface CancelSubscriptionModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  subscriptionId: string
  subscriptionName: string
  currentPeriodEnd: Date
  onConfirm: () => Promise<void>
  loading?: boolean
}
