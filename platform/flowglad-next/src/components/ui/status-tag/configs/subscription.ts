import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  PauseCircle,
  X,
  XCircle,
} from 'lucide-react'
import { SubscriptionStatus } from '@/types'
import type { StatusConfigItem } from '../types'

export const subscriptionStatusConfig = {
  [SubscriptionStatus.Active]: {
    label: 'Active',
    variant: 'success',
    icon: Check,
    tooltip: 'This subscription is active and billing normally.',
  },
  [SubscriptionStatus.Trialing]: {
    label: 'Trialing',
    variant: 'warning',
    icon: Clock,
    tooltip:
      'Customer is in a free trial period. Billing begins when the trial ends.',
  },
  [SubscriptionStatus.CreditTrial]: {
    label: 'Credit Trial',
    variant: 'warning',
    icon: Clock,
    tooltip:
      'Customer is using trial credits. This status is deprecated.',
  },
  [SubscriptionStatus.PastDue]: {
    label: 'Past Due',
    variant: 'destructive',
    icon: AlertCircle,
    tooltip:
      'Payment failed but subscription is still active. Retry will be attempted.',
  },
  [SubscriptionStatus.Unpaid]: {
    label: 'Unpaid',
    variant: 'warning',
    icon: AlertCircle,
    tooltip: 'Payment has failed and the subscription is unpaid.',
  },
  [SubscriptionStatus.CancellationScheduled]: {
    label: 'Cancellation Scheduled',
    variant: 'destructive',
    icon: Clock,
    tooltip:
      'Will be canceled at the end of the current billing period.',
  },
  [SubscriptionStatus.Incomplete]: {
    label: 'Incomplete',
    variant: 'warning',
    icon: AlertTriangle,
    tooltip:
      'Subscription setup was not completed. Customer action may be required.',
  },
  [SubscriptionStatus.IncompleteExpired]: {
    label: 'Incomplete Expired',
    variant: 'destructive',
    icon: XCircle,
    tooltip:
      'The incomplete subscription has expired and cannot be activated.',
  },
  [SubscriptionStatus.Canceled]: {
    label: 'Canceled',
    variant: 'muted',
    icon: X,
    tooltip:
      'This subscription has been canceled and is no longer active.',
  },
  [SubscriptionStatus.Paused]: {
    label: 'Paused',
    variant: 'warning',
    icon: PauseCircle,
    tooltip: 'This subscription is paused and not currently billing.',
  },
} satisfies Record<SubscriptionStatus, StatusConfigItem>
