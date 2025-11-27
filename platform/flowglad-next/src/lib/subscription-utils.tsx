import { sentenceCase } from 'change-case'
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

/**
 * Represents a status badge configuration for use with PageHeaderNew
 */
export interface StatusBadge {
  icon?: React.ReactNode
  label: React.ReactNode
  variant?: 'active' | 'muted' | 'destructive' | 'warning'
}

/**
 * Represents date information for a subscription based on its lifecycle state
 */
export interface SubscriptionDateInfo {
  /** The label to display before the date (e.g., "Renews", "Ends", "Ended") */
  label: string | undefined
  /** The timestamp to display */
  date: number | undefined
  /** The variant indicating the type of date for styling purposes */
  variant: 'renewing' | 'ending' | 'ended' | 'none'
}

/**
 * Determines what date information to show for a subscription
 * based on its current status and cancellation state.
 *
 * @param subscription - The subscription object with status and date fields
 * @returns SubscriptionDateInfo with label, date, and variant
 *
 * @example
 * ```tsx
 * const dateInfo = getSubscriptionDateInfo(subscription)
 * if (dateInfo.label && dateInfo.date) {
 *   return `${dateInfo.label} ${formatDate(dateInfo.date)}`
 * }
 * ```
 */
export function getSubscriptionDateInfo(subscription: {
  status: SubscriptionStatus
  renews: boolean
  currentBillingPeriodEnd?: number | null
  cancelScheduledAt?: number | null
  canceledAt?: number | null
}): SubscriptionDateInfo {
  const {
    status,
    renews,
    currentBillingPeriodEnd,
    cancelScheduledAt,
    canceledAt,
  } = subscription

  // Already canceled - show when it ended
  if (status === SubscriptionStatus.Canceled) {
    return {
      label: canceledAt ? 'Ended' : undefined,
      date: canceledAt ?? undefined,
      variant: 'ended',
    }
  }

  // Cancellation is scheduled - show when it will end
  if (status === SubscriptionStatus.CancellationScheduled) {
    const endDate = cancelScheduledAt ?? currentBillingPeriodEnd
    return {
      label: endDate ? 'Ends' : undefined,
      date: endDate ?? undefined,
      variant: 'ending',
    }
  }

  // Terminal/non-active states - no date shown
  if (
    status === SubscriptionStatus.IncompleteExpired ||
    status === SubscriptionStatus.Paused ||
    status === SubscriptionStatus.Incomplete
  ) {
    return {
      label: undefined,
      date: undefined,
      variant: 'none',
    }
  }

  // Active/renewing subscription - show renewal date
  if (renews && currentBillingPeriodEnd) {
    return {
      label: 'Renews',
      date: currentBillingPeriodEnd,
      variant: 'renewing',
    }
  }

  return {
    label: undefined,
    date: undefined,
    variant: 'none',
  }
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
