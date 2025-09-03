'use client'

import { useState } from 'react'
import { InvoiceStatus } from '@/types'
import { InvoiceStatusTab } from './components/InvoiceStatusTab'
import InvoicesTable from '@/components/InvoicesTable'
import { useInvoiceCountsByStatusMap } from './hooks/useInvoiceCountsByStatusMap'
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs'
import PageTitle from '@/components/ion/PageTitle'
import { MigrationButton as Button } from '@/components/ui/button-migration'
import { Plus } from 'lucide-react'
import CreateInvoiceModal from '@/components/forms/CreateInvoiceModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'

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
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
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
          <TabsList className="gap-8 border-b border-stroke-subtle">
            <InvoiceStatusTab status="all" />
            <InvoiceStatusTab status={InvoiceStatus.Draft} />
            <InvoiceStatusTab status={InvoiceStatus.Open} />
            <InvoiceStatusTab status={InvoiceStatus.Paid} />
            <InvoiceStatusTab status={InvoiceStatus.Uncollectible} />
            <InvoiceStatusTab status={InvoiceStatus.Void} />
          </TabsList>

          <TabsContent value={selectedStatus} className="mt-6">
            <InvoicesTable filters={filters} />
          </TabsContent>
        </Tabs>
        <CreateInvoiceModal
          isOpen={createInvoiceModalOpen}
          setIsOpen={setCreateInvoiceModalOpen}
        />
      </div>
    </InternalPageContainer>
  )
}

export default InternalInvoicesPage
