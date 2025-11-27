'use client'
import { useState } from 'react'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import type { UsageMetersTableFilters } from './data-table'
import { UsageMetersDataTable } from './data-table'

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
