'use client'

import * as React from 'react'
import { InvoicesList } from './invoices-list'
import type { Invoice } from './types'

const mockInvoices: Invoice[] = [
  {
    id: 'inv_1234567890',
    number: 'INV-2024-001',
    status: 'paid',
    created: new Date('2024-01-15'),
    dueDate: new Date('2024-02-15'),
    amountDue: 150000, // $1,500.00
    amountPaid: 150000,
    currency: 'usd',
    description: 'January 2024 - Premium Plan',
    customerName: 'Acme Corporation',
    customerEmail: 'billing@acme.com',
  },
  {
    id: 'inv_2345678901',
    number: 'INV-2024-002',
    status: 'open',
    created: new Date('2024-02-15'),
    dueDate: new Date('2024-03-15'),
    amountDue: 150000,
    amountPaid: 0,
    currency: 'usd',
    description: 'February 2024 - Premium Plan',
    customerName: 'Acme Corporation',
    customerEmail: 'billing@acme.com',
  },
  {
    id: 'inv_3456789012',
    number: 'INV-2024-003',
    status: 'paid',
    created: new Date('2024-03-15'),
    dueDate: new Date('2024-04-15'),
    amountDue: 175000, // $1,750.00
    amountPaid: 175000,
    currency: 'usd',
    description: 'March 2024 - Premium Plan + Add-ons',
    customerName: 'Acme Corporation',
    customerEmail: 'billing@acme.com',
  },
  {
    id: 'inv_4567890123',
    number: 'INV-2024-004',
    status: 'void',
    created: new Date('2024-04-01'),
    dueDate: new Date('2024-05-01'),
    amountDue: 50000,
    amountPaid: 0,
    currency: 'usd',
    description: 'April 2024 - Cancelled Invoice',
    customerName: 'Acme Corporation',
    customerEmail: 'billing@acme.com',
  },
  {
    id: 'inv_5678901234',
    number: 'INV-2024-005',
    status: 'draft',
    created: new Date('2024-04-15'),
    dueDate: new Date('2024-05-15'),
    amountDue: 200000,
    amountPaid: 0,
    currency: 'usd',
    description: 'Upcoming Invoice - Enterprise Plan',
    customerName: 'Acme Corporation',
    customerEmail: 'billing@acme.com',
  },
]

export default function InvoicesListDemo() {
  const [currentPage, setCurrentPage] = React.useState(1)
  const [loading, setLoading] = React.useState(false)
  const pageSize = 10

  const handleInvoiceClick = (invoiceId: string) => {
    // In a real app, this would navigate to invoice details or open a modal
    // For demo, we'll just show an alert
    alert(`Invoice clicked: ${invoiceId}`)
  }

  const handleDownload = async (invoiceId: string) => {
    // In a real app, this would trigger a download
    // Simulate API call
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      alert(`Invoice ${invoiceId} download started`)
    }, 1000)
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Invoices List Component
        </h1>
        <p className="text-muted-foreground">
          A comprehensive invoice list component with sorting,
          pagination, and status badges.
        </p>
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Default View</h2>
          <InvoicesList
            invoices={mockInvoices}
            onInvoiceClick={handleInvoiceClick}
            onDownload={handleDownload}
          />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">
            With Pagination
          </h2>
          <InvoicesList
            invoices={mockInvoices}
            onInvoiceClick={handleInvoiceClick}
            onDownload={handleDownload}
            pagination={{
              page: currentPage,
              pageSize: pageSize,
              total: mockInvoices.length,
              onPageChange: setCurrentPage,
            }}
          />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">
            Loading State
          </h2>
          <InvoicesList invoices={[]} loading={true} />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Empty State</h2>
          <InvoicesList invoices={[]} loading={false} />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">
            Read-only (No Actions)
          </h2>
          <InvoicesList invoices={mockInvoices.slice(0, 3)} />
        </div>
      </div>

      <div className="mt-12 p-6 bg-muted rounded-lg">
        <h2 className="text-xl font-semibold mb-4">
          Component Features
        </h2>
        <ul className="space-y-2 list-disc list-inside">
          <li>Sortable columns (click headers to sort)</li>
          <li>Status badges with color coding</li>
          <li>Currency formatting with locale support</li>
          <li>Date formatting with locale support</li>
          <li>Clickable rows for invoice details</li>
          <li>Download button for each invoice</li>
          <li>Pagination support</li>
          <li>Loading state with skeletons</li>
          <li>Empty state with helpful message</li>
          <li>Responsive design with mobile support</li>
          <li>Hover effects and transitions</li>
        </ul>
      </div>

      <div className="mt-8 p-6 bg-muted rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Usage Example</h2>
        <pre className="bg-background p-4 rounded overflow-x-auto">
          <code>{`import { InvoicesList } from "@/registry/base/invoices-list";

function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchInvoices(page).then(data => {
      setInvoices(data.invoices);
      setLoading(false);
    });
  }, [page]);

  return (
    <InvoicesList
      invoices={invoices}
      loading={loading}
      onInvoiceClick={(id) => router.push(\`/invoices/\${id}\`)}
      onDownload={downloadInvoice}
      pagination={{
        page,
        pageSize: 10,
        total: 100,
        onPageChange: setPage,
      }}
    />
  );
}`}</code>
        </pre>
      </div>
    </div>
  )
}
