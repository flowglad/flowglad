'use client'
import { PageHeader } from '@/components/ui/page-header'
import { UsageMetersDataTable } from './data-table'
import type { UsageMetersTableFilters } from './data-table'
import InternalPageContainer from '@/components/InternalPageContainer'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import { useState } from 'react'
import Breadcrumb from '@/components/navigation/Breadcrumb'

export default function UsageMetersPage() {
  const [createUsageMeterModalOpen, setCreateUsageMeterModalOpen] =
    useState(false)
  const [filters, setFilters] = useState<UsageMetersTableFilters>({})

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Usage Meters" className="mb-6" />
        <UsageMetersDataTable
          filters={filters}
          onCreateUsageMeter={() =>
            setCreateUsageMeterModalOpen(true)
          }
        />
      </div>
      <CreateUsageMeterModal
        isOpen={createUsageMeterModalOpen}
        setIsOpen={setCreateUsageMeterModalOpen}
      />
    </InternalPageContainer>
  )
}
