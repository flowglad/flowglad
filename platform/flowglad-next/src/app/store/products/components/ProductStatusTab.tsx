import { Tab } from '@/components/ion/Tab'
import { useProductCountsByStatusMap } from '../hooks/useProductCountsByStatusMap'
import { FallbackSkeleton } from '@/components/ion/Skeleton'
import { sentenceCase } from 'change-case'

interface ProductStatusTabProps {
  status: 'all' | 'active' | 'inactive'
  isActive: boolean
}

export const ProductStatusTab = ({
  status,
  isActive,
}: ProductStatusTabProps) => {
  const { isLoading, getCountForStatus } =
    useProductCountsByStatusMap()
  const count = getCountForStatus(status)
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
