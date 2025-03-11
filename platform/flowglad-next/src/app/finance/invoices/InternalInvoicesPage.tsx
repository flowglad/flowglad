'use client'

import { PageHeader } from '@/components/ion/PageHeader'
import InvoicesTable from '@/components/InvoicesTable'
import { InvoiceStatus } from '@/types'
import { ClientInvoiceWithLineItems } from '@/db/schema/invoiceLineItems'

interface InternalInvoicesPageProps {
  invoices: ClientInvoiceWithLineItems[]
}

export default function InternalInvoicesPage({
  invoices,
}: InternalInvoicesPageProps) {
  return (
    <div className="h-full flex justify-between items-center gap-2.5">
      <div className="bg-background flex-1 h-full w-full flex gap-6 p-6 pb-10">
        <div className="flex-1 h-full w-full flex flex-col">
          <PageHeader
            title="Invoices"
            tabs={[
              {
                label: 'All',
                subPath: 'all',
                Component: () => (
                  <InvoicesTable invoicesAndLineItems={invoices} />
                ),
              },
              {
                label: 'Open',
                subPath: 'open',
                Component: () => (
                  <InvoicesTable
                    invoicesAndLineItems={invoices.filter(
                      (invoice) =>
                        invoice.status === InvoiceStatus.Open
                    )}
                  />
                ),
              },
              {
                label: 'Paid',
                subPath: 'paid',
                Component: () => (
                  <InvoicesTable
                    invoicesAndLineItems={invoices.filter(
                      (invoice) =>
                        invoice.status === InvoiceStatus.Paid
                    )}
                  />
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
