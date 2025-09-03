'use client'
import PageTitle from '@/components/ion/PageTitle'
import UsageMetersTable, {
  UsageMetersTableFilters,
} from './UsageMetersTable'
import InternalPageContainer from '@/components/InternalPageContainer'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Breadcrumb from '@/components/navigation/Breadcrumb'

export default function UsageMetersPage() {
  const [createUsageMeterModalOpen, setCreateUsageMeterModalOpen] =
    useState(false)
  const [filters, setFilters] = useState<UsageMetersTableFilters>({})

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <div className="flex flex-row justify-between items-center mb-6 gap-8">
          <PageTitle>Usage Meters</PageTitle>
          <Button onClick={() => setCreateUsageMeterModalOpen(true)}>
            <Plus size={16} strokeWidth={2} />
            Create Usage Meter
          </Button>
        </div>
        <UsageMetersTable filters={filters} />
      </div>
      <CreateUsageMeterModal
        isOpen={createUsageMeterModalOpen}
        setIsOpen={setCreateUsageMeterModalOpen}
      />
    </InternalPageContainer>
  )
}
