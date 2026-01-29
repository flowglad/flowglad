import { SubscriptionStatus } from '@db-core/enums'

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
 * based on its current status, cancellation state, and trial status.
 *
 * Priority order:
 * 1. Canceled → "Ended {canceledAt}"
 * 2. Cancellation Scheduled → "Ends {cancelScheduledAt}"
 * 3. Terminal states (IncompleteExpired, Paused, Incomplete) → no date
 * 4. Trialing/CreditTrial → "Trial ends {trialEnd}"
 * 5. Active/renewing → "Renews {currentBillingPeriodEnd}"
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
  trialEnd?: number | null
}): SubscriptionDateInfo {
  const {
    status,
    renews,
    currentBillingPeriodEnd,
    cancelScheduledAt,
    canceledAt,
    trialEnd,
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

  // Trialing subscription - show when trial ends
  if (
    (status === SubscriptionStatus.Trialing ||
      status === SubscriptionStatus.CreditTrial) &&
    trialEnd != null
  ) {
    return {
      label: 'Trial ends',
      date: trialEnd,
      variant: 'ending',
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
