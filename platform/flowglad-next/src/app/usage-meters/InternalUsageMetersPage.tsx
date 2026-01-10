'use client'
import { useState } from 'react'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import type { UsageMetersTableFilters } from './data-table'
import { UsageMetersDataTable } from './data-table'

export default function UsageMetersPage() {
  const [createUsageMeterModalOpen, setCreateUsageMeterModalOpen] =
    useState(false)
  const [filters, setFilters] = useState<UsageMetersTableFilters>({})

  return (
    <PageContainer>
      <PageHeaderNew
        title="Usage Meters"
        hideBorder
        className="pb-2"
      />
      <UsageMetersDataTable
        filters={filters}
        onCreateUsageMeter={() => setCreateUsageMeterModalOpen(true)}
      />
      <CreateUsageMeterModal
        isOpen={createUsageMeterModalOpen}
        setIsOpen={setCreateUsageMeterModalOpen}
      />
    </PageContainer>
  )
}
