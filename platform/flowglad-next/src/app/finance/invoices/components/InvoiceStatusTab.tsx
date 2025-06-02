import { Tab } from '@/components/ion/Tab'
import { InvoiceStatus } from '@/types'
import { sentenceCase } from 'change-case'

interface InvoiceStatusTabProps {
  status: InvoiceStatus | 'all'
  isActive: boolean
}

export const InvoiceStatusTab = ({
  status,
  isActive,
}: InvoiceStatusTabProps) => {
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <Tab value={status} state={isActive ? 'selected' : 'default'}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </Tab>
  )
}
