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
import { FilterButtonGroup } from '@/components/ui/filter-button-group'

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
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Discounts" />
        <div className="w-full">
          <FilterButtonGroup
            options={filterOptions}
            value={activeFilter}
            onValueChange={setActiveFilter}
            className="mb-6"
          />
          <DiscountsDataTable
            filters={getFilterForTab(activeFilter)}
            onCreateDiscount={() => setIsCreateDiscountOpen(true)}
          />
        </div>
        <CreateDiscountModal
          isOpen={isCreateDiscountOpen}
          setIsOpen={setIsCreateDiscountOpen}
        />
      </div>
    </InternalPageContainer>
  )
}

export default InternalDiscountsPage
