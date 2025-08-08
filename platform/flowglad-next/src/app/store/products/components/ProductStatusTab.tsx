import { TabsTrigger } from '@/components/ui/tabs'
import { sentenceCase } from 'change-case'

interface ProductStatusTabProps {
  status: 'all' | 'active' | 'inactive'
}

export const ProductStatusTab = ({
  status,
}: ProductStatusTabProps) => {
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <TabsTrigger value={status}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </TabsTrigger>
  )
}
