'use client'

import { useState } from 'react'
// import { Button } from '@/components/ui/button'
// import { Plus } from 'lucide-react'
// import CreateInvoiceModal from '@/components/forms/CreateInvoiceModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { InvoiceStatus } from '@/types'
import { InvoicesDataTable } from './data-table'
import { useInvoiceCountsByStatusMap } from './hooks/useInvoiceCountsByStatusMap'

const InternalInvoicesPage = () => {
  // const [createInvoiceModalOpen, setCreateInvoiceModalOpen] =
  //   useState(false)
  const [selectedStatus, setSelectedStatus] = useState<
    InvoiceStatus | 'all'
  >('all')
  const { isLoading, getCountForStatus } =
    useInvoiceCountsByStatusMap()

  const handleFilterChange = (value: string) => {
    setSelectedStatus(value as InvoiceStatus | 'all')
  }

  // Filter options for the button group
  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: InvoiceStatus.Draft, label: 'Draft' },
    { value: InvoiceStatus.Open, label: 'Open' },
    { value: InvoiceStatus.Paid, label: 'Paid' },
    { value: InvoiceStatus.Uncollectible, label: 'Uncollectible' },
    { value: InvoiceStatus.Void, label: 'Void' },
  ]

  const filters =
    selectedStatus !== 'all' ? { status: selectedStatus } : {}

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader
          title="Invoices"
          // Removed create invoice action - disabled per main branch business logic
        />

        <div className="w-full">
          <InvoicesDataTable
            filters={filters}
            filterOptions={filterOptions}
            activeFilter={selectedStatus}
            onFilterChange={handleFilterChange}
            // onCreateInvoice={() => setCreateInvoiceModalOpen(true)}
          />
        </div>
        {/* <CreateInvoiceModal
          isOpen={createInvoiceModalOpen}
          setIsOpen={setCreateInvoiceModalOpen}
        /> */}
      </div>
    </InternalPageContainer>
  )
}

export default InternalInvoicesPage
