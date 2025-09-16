'use client'
import { PageHeader } from '@/components/ui/page-header'
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
        <PageHeader
          title="Usage Meters"
          className="mb-6"
          action={
            <Button
              onClick={() => setCreateUsageMeterModalOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" strokeWidth={2} />
              Create Usage Meter
            </Button>
          }
        />
        <UsageMetersTable filters={filters} />
      </div>
      <CreateUsageMeterModal
        isOpen={createUsageMeterModalOpen}
        setIsOpen={setCreateUsageMeterModalOpen}
      />
    </InternalPageContainer>
  )
}
