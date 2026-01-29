import type { SubscriptionStatus } from '@db-core/enums'
import { sentenceCase } from 'change-case'
import { TabsTrigger } from '@/components/ui/tabs'
import { useSubscriptionCountsByStatusMap } from '../hooks/useSubscriptionCountsByStatusMap'

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
