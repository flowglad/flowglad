import type { PaymentStatus } from '@db-core/enums'
import { sentenceCase } from 'change-case'
import { TabsTrigger } from '@/components/ui/tabs'
import { usePaymentCountsByStatusMap } from '../hooks/usePaymentCountsByStatusMap'

interface PaymentsTabProps {
  status: PaymentStatus | 'all'
}

export const PaymentsTab = ({ status }: PaymentsTabProps) => {
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <TabsTrigger value={status}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </TabsTrigger>
  )
}
