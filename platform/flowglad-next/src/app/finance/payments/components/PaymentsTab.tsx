import { Tab } from '@/components/ion/Tab'
import { PaymentStatus } from '@/types'
import { usePaymentCountsByStatusMap } from '../hooks/usePaymentCountsByStatusMap'
import { FallbackSkeleton } from '@/components/ion/Skeleton'
import { sentenceCase } from 'change-case'

interface PaymentsTabProps {
  status: PaymentStatus | 'all'
  isActive: boolean
}

export const PaymentsTab = ({
  status,
  isActive,
}: PaymentsTabProps) => {
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <Tab value={status} state={isActive ? 'selected' : 'default'}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </Tab>
  )
}
