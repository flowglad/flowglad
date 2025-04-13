'use client'

import { useState } from 'react'
import { InvoiceStatus } from '@/types'
import { InvoiceStatusTab } from './components/InvoiceStatusTab'
import InvoicesTable from '@/components/InvoicesTable'
import { useInvoiceCountsByStatusMap } from './hooks/useInvoiceCountsByStatusMap'
import { Tabs, TabsContent, TabsList } from '@/components/ion/Tab'

const InternalInvoicesPage = () => {
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
      <h1 className="text-2xl font-bold">Invoices</h1>

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
    </div>
  )
}

export default InternalInvoicesPage
