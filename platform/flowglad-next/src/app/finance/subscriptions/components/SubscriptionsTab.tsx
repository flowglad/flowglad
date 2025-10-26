import { TabsTrigger } from '@/components/ui/tabs'
import { SubscriptionStatus } from '@/types'
import { useSubscriptionCountsByStatusMap } from '../hooks/useSubscriptionCountsByStatusMap'
import { sentenceCase } from 'change-case'

interface SubscriptionsTabProps {
  status: SubscriptionStatus | 'all'
  isActive?: boolean // Keep for backward compatibility but not needed
}

export const SubscriptionsTab = ({
  status,
  isActive,
}: SubscriptionsTabProps) => {
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <TabsTrigger value={status}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </TabsTrigger>
  )
}
