import { Tab } from '@/components/ion/Tab'
import { InvoiceStatus } from '@/types'
import { FallbackSkeleton } from '@/components/ion/Skeleton'
import { sentenceCase } from 'change-case'

interface InvoiceStatusTabProps {
  status: InvoiceStatus | 'all'
  isActive: boolean
  count: number
  isLoading: boolean
}

export const InvoiceStatusTab = ({
  status,
  isActive,
  count,
  isLoading,
}: InvoiceStatusTabProps) => {
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
