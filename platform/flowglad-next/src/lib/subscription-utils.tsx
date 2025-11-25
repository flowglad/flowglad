import {
  Check,
  X,
  Clock,
  AlertTriangle,
  AlertCircle,
  PauseCircle,
  XCircle,
} from 'lucide-react'
import { SubscriptionStatus } from '@/types'
import { sentenceCase } from 'change-case'

/**
 * Represents a status badge configuration for use with PageHeaderNew
 */
export interface StatusBadge {
  icon?: React.ReactNode
  label: React.ReactNode
  variant?: 'active' | 'muted' | 'destructive' | 'warning'
}

/**
 * Converts a subscription status to a badge configuration with appropriate icon and variant
 * @param status - The subscription status to convert
 * @returns StatusBadge configuration for the PageHeaderNew component
 */
export function getSubscriptionStatusBadge(
  status: SubscriptionStatus
): StatusBadge {
  let icon = null
  let variant: 'active' | 'muted' | 'destructive' | 'warning' =
    'muted'

  switch (status) {
    case SubscriptionStatus.Active:
      icon = (
        <Check
          className="w-full h-full stroke-current"
          strokeWidth={3}
        />
      )
      variant = 'active'
      break
    case SubscriptionStatus.Canceled:
      icon = (
        <X className="w-full h-full stroke-current" strokeWidth={3} />
      )
      variant = 'destructive'
      break
    case SubscriptionStatus.CancellationScheduled:
      icon = (
        <Clock
          className="w-full h-full stroke-current"
          strokeWidth={3}
        />
      )
      variant = 'destructive'
      break
    case SubscriptionStatus.Incomplete:
      icon = (
        <AlertTriangle
          className="w-full h-full stroke-current"
          strokeWidth={3}
        />
      )
      variant = 'warning'
      break
    case SubscriptionStatus.IncompleteExpired:
      icon = (
        <XCircle
          className="w-full h-full stroke-current"
          strokeWidth={3}
        />
      )
      variant = 'destructive'
      break
    case SubscriptionStatus.PastDue:
      icon = (
        <AlertCircle
          className="w-full h-full stroke-current"
          strokeWidth={3}
        />
      )
      variant = 'destructive'
      break
    case SubscriptionStatus.Paused:
      icon = (
        <PauseCircle
          className="w-full h-full stroke-current"
          strokeWidth={3}
        />
      )
      variant = 'warning'
      break
    case SubscriptionStatus.Trialing:
    case SubscriptionStatus.CreditTrial:
      icon = (
        <Clock
          className="w-full h-full stroke-current"
          strokeWidth={3}
        />
      )
      variant = 'warning'
      break
    case SubscriptionStatus.Unpaid:
      icon = (
        <AlertCircle
          className="w-full h-full stroke-current"
          strokeWidth={3}
        />
      )
      variant = 'warning'
      break
    default:
      icon = undefined
      variant = 'muted'
  }

  return {
    icon,
    label: sentenceCase(status),
    variant,
  }
}
