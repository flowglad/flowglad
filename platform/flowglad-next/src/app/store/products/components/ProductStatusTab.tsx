import { Tab } from '@/components/ion/Tab'
import { sentenceCase } from 'change-case'

interface ProductStatusTabProps {
  status: 'all' | 'active' | 'inactive'
  isActive: boolean
}

export const ProductStatusTab = ({
  status,
  isActive,
}: ProductStatusTabProps) => {
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <Tab value={status} state={isActive ? 'selected' : 'default'}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
      </div>
    </Tab>
  )
}
