'use client'
import { useState } from 'react'
import CreateDiscountModal from '@/components/forms/CreateDiscountModal'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
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
  const [statusFilter, setStatusFilter] = useState('all')

  const getFilters = (): DiscountsTableFilters => {
    if (statusFilter === 'all') {
      return {}
    }
    return { active: statusFilter === 'active' }
  }

  return (
    <>
      <InnerPageContainerNew>
        <PageHeaderNew title="Discounts" hideBorder />
        <DiscountsDataTable
          filters={getFilters()}
          onCreateDiscount={() => setIsCreateDiscountOpen(true)}
          hiddenColumns={['active', 'duration']}
          filterOptions={filterOptions}
          filterValue={statusFilter}
          onFilterChange={setStatusFilter}
        />
      </InnerPageContainerNew>
      <CreateDiscountModal
        isOpen={isCreateDiscountOpen}
        setIsOpen={setIsCreateDiscountOpen}
      />
    </>
  )
}

export default InternalDiscountsPage
