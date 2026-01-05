'use client'

import { useState } from 'react'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { InvoiceStatus } from '@/types'
import { InvoicesDataTable } from './data-table'

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: InvoiceStatus.Draft, label: 'Draft' },
  { value: InvoiceStatus.Open, label: 'Open' },
  { value: InvoiceStatus.Paid, label: 'Paid' },
  { value: InvoiceStatus.Uncollectible, label: 'Uncollectible' },
  { value: InvoiceStatus.Void, label: 'Void' },
]

export default function InternalInvoicesPage() {
  const [statusFilter, setStatusFilter] = useState('all')

  const getFilters = () => {
    if (statusFilter === 'all') {
      return {}
    }

    return {
      status: statusFilter as InvoiceStatus,
    }
  }

  return (
    <InnerPageContainerNew>
      <PageHeaderNew title="Invoices" hideBorder className="pb-2" />
      <InvoicesDataTable
        filters={getFilters()}
        filterOptions={filterOptions}
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
      />
    </InnerPageContainerNew>
  )
}
