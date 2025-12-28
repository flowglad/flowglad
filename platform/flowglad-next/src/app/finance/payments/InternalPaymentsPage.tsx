'use client'

import { useState } from 'react'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { PaymentStatus } from '@/types'
import { PaymentsDataTable } from './data-table'

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: PaymentStatus.Succeeded, label: 'Succeeded' },
  { value: PaymentStatus.Processing, label: 'Processing' },
  { value: PaymentStatus.Refunded, label: 'Refunded' },
  { value: PaymentStatus.Canceled, label: 'Canceled' },
]

export default function InternalPaymentsPage() {
  const [statusFilter, setStatusFilter] = useState('all')

  const getFilters = () => {
    if (statusFilter === 'all') {
      return {}
    }

    return {
      status: statusFilter as PaymentStatus,
    }
  }

  return (
    <InnerPageContainerNew>
      <PageHeaderNew title="Payments" hideBorder className="pb-2" />
      <PaymentsDataTable
        filters={getFilters()}
        filterOptions={filterOptions}
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        hiddenColumns={['paymentId']}
      />
    </InnerPageContainerNew>
  )
}
