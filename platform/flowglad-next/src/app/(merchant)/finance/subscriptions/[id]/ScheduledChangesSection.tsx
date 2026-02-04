'use client'

import { SubscriptionStatus } from '@db-core/enums'
import { AlertTriangle, Calendar } from 'lucide-react'
import { ExpandSection } from '@/components/ExpandSection'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import type { RichSubscription } from '@/subscriptions/schemas'
import core from '@/utils/core'
import { CancelScheduledAdjustmentButton } from './CancelScheduledAdjustmentButton'
import { UncancelSubscriptionButton } from './UncancelSubscriptionButton'

interface ScheduledChangesSectionProps {
  subscription: RichSubscription
}

/**
 * Displays any pending scheduled changes for a subscription.
 * - Scheduled adjustment: Shows when the plan will change and a button to cancel it
 * - Scheduled cancellation: Shows when the subscription will cancel and a button to uncancel
 *
 * If no scheduled changes exist, this section is not rendered.
 */
export const ScheduledChangesSection = ({
  subscription,
}: ScheduledChangesSectionProps) => {
  const hasScheduledAdjustment =
    subscription.scheduledAdjustmentAt !== null
  const hasScheduledCancellation =
    subscription.status === SubscriptionStatus.CancellationScheduled

  // Don't render if no scheduled changes
  if (!hasScheduledAdjustment && !hasScheduledCancellation) {
    return null
  }

  return (
    <ExpandSection title="Scheduled Changes" defaultExpanded={true}>
      <div className="flex flex-col gap-4 w-full">
        {hasScheduledAdjustment && (
          <Alert variant="default">
            <Calendar className="h-4 w-4" />
            <AlertTitle>Scheduled Plan Change</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>
                Plan will change on{' '}
                {core.formatDate(subscription.scheduledAdjustmentAt!)}
              </span>
              <div>
                <CancelScheduledAdjustmentButton
                  subscriptionId={subscription.id}
                />
              </div>
            </AlertDescription>
          </Alert>
        )}

        {hasScheduledCancellation && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Cancellation Scheduled</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>
                Subscription will cancel on{' '}
                {subscription.cancelScheduledAt
                  ? core.formatDate(subscription.cancelScheduledAt)
                  : subscription.currentBillingPeriodEnd
                    ? core.formatDate(
                        subscription.currentBillingPeriodEnd
                      )
                    : 'the end of the billing period'}
              </span>
              <div>
                <UncancelSubscriptionButton
                  subscriptionId={subscription.id}
                />
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ExpandSection>
  )
}
