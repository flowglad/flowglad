'use client'

import { useState } from 'react'
import { PaymentsDataTable } from './data-table'
import { PaymentStatus } from '@/types'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import InternalPageContainer from '@/components/InternalPageContainer'
import { PageHeader } from '@/components/ui/page-header'

export default function InternalPaymentsPage() {
  const [activeFilter, setActiveFilter] = useState<string>('all')

  // Filter options for the button group
  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: PaymentStatus.Succeeded, label: 'Succeeded' },
    { value: PaymentStatus.Processing, label: 'Processing' },
    { value: PaymentStatus.Refunded, label: 'Refunded' },
    { value: PaymentStatus.Canceled, label: 'Canceled' },
  ]

  const getFiltersForTab = (tab: string) => {
    if (tab === 'all') {
      return {}
    }

    return {
      status: tab as PaymentStatus,
    }
  }

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <div className="flex flex-row justify-between">
          <PageHeader title="Payments" />
        </div>
        <div className="w-full">
          <PaymentsDataTable
            filters={getFiltersForTab(activeFilter)}
            filterOptions={filterOptions}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        </div>
      </div>
    </InternalPageContainer>
  )
}
