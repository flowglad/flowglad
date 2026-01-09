'use client'
import { useState } from 'react'
import CreateDiscountModal from '@/components/forms/CreateDiscountModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import {
  DiscountsDataTable,
  type DiscountsTableFilters,
} from './data-table'

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

function InternalDiscountsPage() {
  const [isCreateDiscountOpen, setIsCreateDiscountOpen] =
    useState(false)
  const [statusFilter, setStatusFilter] = useState('active')

  const getFilters = (): DiscountsTableFilters => {
    if (statusFilter === 'all') {
      return {}
    }
    return { active: statusFilter === 'active' }
  }

  return (
    <>
      <PageContainer>
        <PageHeaderNew
          title="Discounts"
          hideBorder
          className="pb-2"
        />
        <DiscountsDataTable
          filters={getFilters()}
          onCreateDiscount={() => setIsCreateDiscountOpen(true)}
          hiddenColumns={['active', 'duration']}
          filterOptions={filterOptions}
          filterValue={statusFilter}
          onFilterChange={setStatusFilter}
        />
      </PageContainer>
      <CreateDiscountModal
        isOpen={isCreateDiscountOpen}
        setIsOpen={setIsCreateDiscountOpen}
      />
    </>
  )
}

export default InternalDiscountsPage
