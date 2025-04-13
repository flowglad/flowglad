'use client'

import { useState } from 'react'
import { InvoiceStatus } from '@/types'
import { InvoiceStatusTab } from './components/InvoiceStatusTab'
import InvoicesTable from '@/components/InvoicesTable'
import { useInvoiceCountsByStatusMap } from './hooks/useInvoiceCountsByStatusMap'
import { Tabs, TabsContent, TabsList } from '@/components/ion/Tab'
import PageTitle from '@/components/ion/PageTitle'
import Button from '@/components/ion/Button'
import { Plus } from 'lucide-react'
import CreateInvoiceModal from '@/components/forms/CreateInvoiceModal'

const InternalInvoicesPage = () => {
  const [createInvoiceModalOpen, setCreateInvoiceModalOpen] =
    useState(false)
  const [selectedStatus, setSelectedStatus] = useState<
    InvoiceStatus | 'all'
  >('all')
  const { isLoading, getCountForStatus } =
    useInvoiceCountsByStatusMap()

  const handleTabChange = (value: string) => {
    setSelectedStatus(value as InvoiceStatus | 'all')
  }

  const filters =
    selectedStatus !== 'all' ? { status: selectedStatus } : {}

  return (
    <div className="w-full flex flex-col gap-5 p-5">
      <div className="flex flex-row justify-between">
        <PageTitle>Invoices</PageTitle>
        <Button
          iconLeading={<Plus size={16} />}
          onClick={() => setCreateInvoiceModalOpen(true)}
        >
          Create Invoice
        </Button>
      </div>

      <Tabs value={selectedStatus} onValueChange={handleTabChange}>
        <TabsList>
          <InvoiceStatusTab
            status="all"
            isActive={selectedStatus === 'all'}
            count={getCountForStatus('all')}
            isLoading={isLoading}
          />
          <InvoiceStatusTab
            status={InvoiceStatus.Draft}
            isActive={selectedStatus === InvoiceStatus.Draft}
            count={getCountForStatus(InvoiceStatus.Draft)}
            isLoading={isLoading}
          />
          <InvoiceStatusTab
            status={InvoiceStatus.Open}
            isActive={selectedStatus === InvoiceStatus.Open}
            count={getCountForStatus(InvoiceStatus.Open)}
            isLoading={isLoading}
          />
          <InvoiceStatusTab
            status={InvoiceStatus.Paid}
            isActive={selectedStatus === InvoiceStatus.Paid}
            count={getCountForStatus(InvoiceStatus.Paid)}
            isLoading={isLoading}
          />
          <InvoiceStatusTab
            status={InvoiceStatus.Uncollectible}
            isActive={selectedStatus === InvoiceStatus.Uncollectible}
            count={getCountForStatus(InvoiceStatus.Uncollectible)}
            isLoading={isLoading}
          />
          <InvoiceStatusTab
            status={InvoiceStatus.Void}
            isActive={selectedStatus === InvoiceStatus.Void}
            count={getCountForStatus(InvoiceStatus.Void)}
            isLoading={isLoading}
          />
        </TabsList>

        <TabsContent value={selectedStatus}>
          <InvoicesTable filters={filters} />
        </TabsContent>
      </Tabs>
      <CreateInvoiceModal
        isOpen={createInvoiceModalOpen}
        setIsOpen={setCreateInvoiceModalOpen}
      />
    </div>
  )
}

export default InternalInvoicesPage
