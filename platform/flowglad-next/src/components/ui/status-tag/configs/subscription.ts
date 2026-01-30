import { SubscriptionStatus } from '@db-core/enums'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  PauseCircle,
  X,
  XCircle,
} from 'lucide-react'
import type { StatusConfigItem } from '../types'

export const subscriptionStatusConfig = {
  [SubscriptionStatus.Active]: {
    label: 'Active',
    variant: 'success',
    icon: Check,
    tooltip: 'Subscription is active and billing normally.',
  },
  [SubscriptionStatus.Trialing]: {
    label: 'Trialing',
    variant: 'info',
    icon: Clock,
    tooltip:
      'Customer has full access during the free trial. Billing begins automatically when the trial ends if a payment method is on file.',
  },
  [SubscriptionStatus.CreditTrial]: {
    label: 'Credit Trial',
    variant: 'info',
    icon: Clock,
    tooltip:
      'Customer is using pre-allocated trial credits. This status is deprecated—new subscriptions should use "Trialing" instead.',
  },
  [SubscriptionStatus.PastDue]: {
    label: 'Past Due',
    variant: 'destructive',
    icon: AlertCircle,
    tooltip:
      'Payment failed but access continues. The system will automatically retry. If retries fail, status changes to Unpaid.',
  },
  [SubscriptionStatus.Unpaid]: {
    label: 'Unpaid',
    variant: 'destructive',
    icon: AlertCircle,
    tooltip:
      'All automatic payment retries have failed. The customer must update their payment method to restore service.',
  },
  [SubscriptionStatus.CancellationScheduled]: {
    label: 'Cancellation Scheduled',
    variant: 'muted',
    icon: Clock,
    tooltip:
      'Customer has requested cancellation. Full access continues until the end of the current billing period.',
  },
  [SubscriptionStatus.Incomplete]: {
    label: 'Incomplete',
    variant: 'warning',
    icon: AlertTriangle,
    tooltip:
      'Checkout was started but not completed. The customer needs to provide a valid payment method.',
  },
  [SubscriptionStatus.IncompleteExpired]: {
    label: 'Incomplete Expired',
    variant: 'muted',
    icon: XCircle,
    tooltip:
      'The checkout session expired before completion. A new subscription must be created to proceed.',
  },
  [SubscriptionStatus.Canceled]: {
    label: 'Canceled',
    variant: 'muted',
    icon: X,
    tooltip:
      'This subscription has been terminated. The customer no longer has access.',
  },
  [SubscriptionStatus.Paused]: {
    label: 'Paused',
    variant: 'amethyst',
    icon: PauseCircle,
    tooltip:
      'Subscription is on hold—no billing or access. Can be resumed at any time.',
  },
} satisfies Record<SubscriptionStatus, StatusConfigItem>
