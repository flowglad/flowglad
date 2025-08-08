import { TabsTrigger } from '@/components/ui/tabs'
import { InvoiceStatus } from '@/types'
import { sentenceCase } from 'change-case'

interface InvoiceStatusTabProps {
  status: InvoiceStatus | 'all'
}

export const InvoiceStatusTab = ({
  status,
}: InvoiceStatusTabProps) => {
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <TabsTrigger value={status}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </TabsTrigger>
  )
}
