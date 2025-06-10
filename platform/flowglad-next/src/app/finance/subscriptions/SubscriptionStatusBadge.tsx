import { Subscription } from '@/db/schema/subscriptions'
import core from '@/utils/core'
import { SubscriptionStatus } from '@/types'
import Badge, { BadgeColor } from '@/components/ion/Badge'
import { sentenceCase } from 'change-case'

const subscriptionStatusColors: Record<
  SubscriptionStatus,
  BadgeColor
> = {
  [SubscriptionStatus.Active]: 'green',
  [SubscriptionStatus.Canceled]: 'red',
  [SubscriptionStatus.CancellationScheduled]: 'red',
  [SubscriptionStatus.Incomplete]: 'yellow',
  [SubscriptionStatus.IncompleteExpired]: 'red',
  [SubscriptionStatus.PastDue]: 'red',
  [SubscriptionStatus.Paused]: 'yellow',
  [SubscriptionStatus.Trialing]: 'yellow',
  [SubscriptionStatus.Unpaid]: 'yellow',
  [SubscriptionStatus.CreditTrial]: 'yellow',
}

const SubscriptionStatusBadge = ({
  status,
}: {
  status: SubscriptionStatus
}) => {
  return (
    <Badge color={subscriptionStatusColors[status]}>
      {sentenceCase(status)}
    </Badge>
  )
}

export default SubscriptionStatusBadge
