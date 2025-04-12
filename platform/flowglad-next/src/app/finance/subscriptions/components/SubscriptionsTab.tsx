import { Tab } from '@/components/ion/Tab'
import { SubscriptionStatus } from '@/types'
import { useSubscriptionCountsByStatusMap } from '../hooks/useSubscriptionCountsByStatusMap'
import { FallbackSkeleton } from '@/components/ion/Skeleton'
import { sentenceCase } from 'change-case'

interface SubscriptionsTabProps {
  status: SubscriptionStatus | 'all'
  isActive: boolean
}

export const SubscriptionsTab = ({
  status,
  isActive,
}: SubscriptionsTabProps) => {
  const { isLoading, getCountForStatus } =
    useSubscriptionCountsByStatusMap()
  const count = getCountForStatus(status)
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <Tab value={status} state={isActive ? 'selected' : 'default'}>
      <div className="flex items-center gap-2">
        <FallbackSkeleton
          showSkeleton={isLoading}
          className="h-4 w-8"
        >
          <span className="font-bold">{count}</span>
        </FallbackSkeleton>
        <span>{label}</span>
      </div>
    </Tab>
  )
}
