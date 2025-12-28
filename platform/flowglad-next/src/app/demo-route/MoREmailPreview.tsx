import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import { OrderReceiptEmail } from '@/email-templates/customer-order-receipt'
import { InvoiceNotificationEmail } from '@/email-templates/invoice-notification'
import { InvoiceReminderEmail } from '@/email-templates/invoice-reminder'

// Mock data for email preview
const mockInvoice = {
  id: 'inv_mock123',
  invoiceNumber: 'INV-2024-001',
  invoiceDate: new Date().toISOString(),
  dueDate: new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString(),
  organizationId: 'org_mock123',
  customerId: 'cus_mock123',
  currency: 'USD',
  subtotal: 9900,
  taxAmount: 792,
  total: 10692,
  status: 'open',
  type: 'invoice',
  livemode: true,
  createdAt: new Date().toISOString(),
  pdfURL: null,
} as unknown as Invoice.Record

const mockLineItems = [
  {
    id: 'li_mock1',
    invoiceId: 'inv_mock123',
    name: 'Pro Plan Subscription',
    description: 'Monthly subscription',
    quantity: 1,
    unitPrice: 4900,
    price: 4900,
    livemode: true,
  },
  {
    id: 'li_mock2',
    invoiceId: 'inv_mock123',
    name: 'Additional API Calls',
    description: '10,000 API calls',
    quantity: 1,
    unitPrice: 5000,
    price: 5000,
    livemode: true,
  },
] as unknown as InvoiceLineItem.Record[]

const mockOrderLineItems = [
  { name: 'Pro Plan Subscription', price: 4900, quantity: 1 },
  { name: 'Additional API Calls', price: 5000, quantity: 1 },
]

type EmailTemplate =
  | 'invoice-notification'
  | 'invoice-reminder'
  | 'order-receipt'

export const MoREmailPreview = ({
  template = 'invoice-notification',
  isMoR = true,
}: {
  template?: EmailTemplate
  isMoR?: boolean
}) => {
  const organizationName = 'Acme Corp'

  const renderTemplate = () => {
    switch (template) {
      case 'invoice-notification':
        return (
          <InvoiceNotificationEmail
            invoice={mockInvoice}
            invoiceLineItems={mockLineItems}
            organizationName={organizationName}
            livemode={true}
            isMoR={isMoR}
          />
        )
      case 'invoice-reminder':
        return (
          <InvoiceReminderEmail
            invoice={mockInvoice}
            invoiceLineItems={mockLineItems}
            organizationName={organizationName}
            livemode={true}
            isMoR={isMoR}
          />
        )
      case 'order-receipt':
        return (
          <OrderReceiptEmail
            invoiceNumber={mockInvoice.invoiceNumber}
            orderDate={new Date(
              mockInvoice.createdAt!
            ).toLocaleDateString()}
            invoice={{
              subtotal: mockInvoice.subtotal,
              taxAmount: mockInvoice.taxAmount,
              currency: mockInvoice.currency,
            }}
            lineItems={mockOrderLineItems}
            organizationName={organizationName}
            organizationId={mockInvoice.organizationId}
            customerId={mockInvoice.customerId!}
            livemode={true}
            isMoR={isMoR}
          />
        )
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 text-sm text-gray-600">
        <strong>Template:</strong> {template} |{' '}
        <strong>MoR Mode:</strong> {isMoR ? 'Yes' : 'No'}
      </div>
      <div className="border rounded-lg overflow-hidden bg-white">
        {renderTemplate()}
      </div>
    </div>
  )
}

export default MoREmailPreview
