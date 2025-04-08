'use client'

import { PageHeader } from '@/components/ion/PageHeader'
import InvoicesTable from '@/components/InvoicesTable'
import { InvoiceStatus } from '@/types'
import { ClientInvoiceWithLineItems } from '@/db/schema/invoiceLineItems'
import InternalPageContainer from '@/components/InternalPageContainer'

interface InternalInvoicesPageProps {
  invoices: ClientInvoiceWithLineItems[]
}

export default function InternalInvoicesPage({
  invoices,
}: InternalInvoicesPageProps) {
  return (
    <InternalPageContainer>
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
                  (item) => item.invoice.status === InvoiceStatus.Open
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
                  (item) => item.invoice.status === InvoiceStatus.Paid
                )}
              />
            ),
          },
          {
            label: 'Void',
            subPath: 'void',
            Component: () => (
              <InvoicesTable
                invoicesAndLineItems={invoices.filter(
                  (item) => item.invoice.status === InvoiceStatus.Void
                )}
              />
            ),
          },
        ]}
      />
    </InternalPageContainer>
  )
}
