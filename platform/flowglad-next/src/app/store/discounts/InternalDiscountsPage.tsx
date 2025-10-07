'use client'
import { useState } from 'react'
import CreateDiscountModal from '@/components/forms/CreateDiscountModal'
import {
  DiscountsDataTable,
  DiscountsTableFilters,
} from './data-table'
import InternalPageContainer from '@/components/InternalPageContainer'
import { PageHeader } from '@/components/ui/page-header'
import Breadcrumb from '@/components/navigation/Breadcrumb'

export enum FocusedTab {
  All = 'all',
  Active = 'active',
  Inactive = 'inactive',
}

function InternalDiscountsPage() {
  const [isCreateDiscountOpen, setIsCreateDiscountOpen] =
    useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')

  // Filter options for the button group
  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]

  const getFilterForTab = (tab: string): DiscountsTableFilters => {
    if (tab === 'all') {
      return {}
    }

    return {
      active: tab === 'active',
    }
  }

  return (
    <>
      <InternalPageContainer>
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb />
          <PageHeader title="Discounts" />
          <div>
            <DiscountsDataTable
              filters={getFilterForTab(activeFilter)}
              onCreateDiscount={() => setIsCreateDiscountOpen(true)}
              filterOptions={filterOptions}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
            />
          </div>
        </div>
      </InternalPageContainer>
      <CreateDiscountModal
        isOpen={isCreateDiscountOpen}
        setIsOpen={setIsCreateDiscountOpen}
      />
    </>
  )
}

export default InternalDiscountsPage
