import { sentenceCase } from 'change-case'
import { Badge } from '@/components/ui/badge'
import { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionStatus } from '@/types'
import core from '@/utils/core'

const subscriptionStatusColors: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.Active]:
    'bg-jade-background text-jade-foreground',
  [SubscriptionStatus.Canceled]: 'bg-red-100 text-red-800',
  [SubscriptionStatus.CancellationScheduled]:
    'bg-red-100 text-red-800',
  [SubscriptionStatus.Incomplete]: 'bg-yellow-100 text-yellow-800',
  [SubscriptionStatus.IncompleteExpired]: 'bg-red-100 text-red-800',
  [SubscriptionStatus.PastDue]: 'bg-red-100 text-red-800',
  [SubscriptionStatus.Paused]: 'bg-yellow-100 text-yellow-800',
  [SubscriptionStatus.Trialing]: 'bg-yellow-100 text-yellow-800',
  [SubscriptionStatus.Unpaid]: 'bg-yellow-100 text-yellow-800',
  [SubscriptionStatus.CreditTrial]: 'bg-yellow-100 text-yellow-800',
}

const SubscriptionStatusBadge = ({
  status,
}: {
  status: SubscriptionStatus
}) => {
  return (
    <Badge
      variant="secondary"
      className={subscriptionStatusColors[status]}
    >
      {sentenceCase(status)}
    </Badge>
  )
}

export default SubscriptionStatusBadge
