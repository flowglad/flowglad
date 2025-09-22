import { TabsTrigger } from '@/components/ui/tabs'
import { SubscriptionStatus } from '@/types'
import { sentenceCase } from 'change-case'

interface SubscriptionsTabProps {
  status: SubscriptionStatus | 'all'
  isActive?: boolean // Keep for backward compatibility but not needed
}

export const SubscriptionsTab = ({
  status,
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
