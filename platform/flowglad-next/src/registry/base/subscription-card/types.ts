import type { SubscriptionStatus } from '@/registry/lib/subscription-status'

export interface SubscriptionItem {
  id: string
  priceId: string
  productId: string
  productName: string
  quantity: number
  unitAmount: number
  interval?: 'month' | 'year' | 'week' | 'day'
  intervalCount?: number
  usageType?: 'metered' | 'licensed'
}

export interface Subscription {
  id: string
  name: string
  status: SubscriptionStatus
  currentPeriodEnd?: Date
  currentPeriodStart?: Date
  cancelAtPeriodEnd: boolean
  canceledAt?: Date
  trialEnd?: Date
  items: SubscriptionItem[]
  currency: string
  defaultPaymentMethodId?: string
}

export interface SubscriptionCardProps {
  subscription: Subscription
  onCancel?: (subscriptionId: string) => Promise<void>
  onUncancel?: (subscriptionId: string) => Promise<void>
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
  subscriptionName: string
  status: SubscriptionStatus
  cancelAtPeriodEnd: boolean
  currentPeriodEnd?: Date
  onCancel?: (subscriptionId: string) => Promise<void>
  onUncancel?: (subscriptionId: string) => Promise<void>
  loading?: boolean
  className?: string
}

export interface CancelSubscriptionDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  subscriptionId: string
  subscriptionName: string
  currentPeriodEnd?: Date
  onConfirm: () => Promise<void>
  loading?: boolean
}

export interface UncancelSubscriptionDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  subscriptionId: string
  subscriptionName: string
  currentPeriodEnd?: Date
  onConfirm: () => Promise<void>
  loading?: boolean
}
