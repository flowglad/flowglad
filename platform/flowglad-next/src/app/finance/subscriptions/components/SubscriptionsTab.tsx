import { Tab } from '@/components/ion/Tab'
import { SubscriptionStatus } from '@/types'
import { useSubscriptionCountsByStatusMap } from '../hooks/useSubscriptionCountsByStatusMap'
import { FallbackSkeleton } from '@/components/ui/skeleton'
import { sentenceCase } from 'change-case'

interface SubscriptionsTabProps {
  status: SubscriptionStatus | 'all'
  isActive: boolean
}

export const SubscriptionsTab = ({
  status,
  isActive,
}: SubscriptionsTabProps) => {
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <Tab value={status} state={isActive ? 'selected' : 'default'}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </Tab>
  )
}
