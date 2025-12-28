'use client'
import { useState } from 'react'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import { OrderReceiptEmail } from '@/email-templates/customer-order-receipt'
import { InvoiceNotificationEmail } from '@/email-templates/invoice-notification'
import { InvoiceReminderEmail } from '@/email-templates/invoice-reminder'
import { CurrencyCode, SubscriptionItemType } from '@/types'

// Mock data for invoice demos
// Using timestamps for dates (number type expected by schema)
const mockDate = Date.now()

// We cast these as the Record types since this is a demo page
// and we only need the fields used by the email templates
const mockInvoice = {
  id: 'inv_mock123',
  invoiceNumber: 'INV-2024-0042',
  invoiceDate: mockDate,
  dueDate: mockDate + 30 * 24 * 60 * 60 * 1000, // 30 days later
  currency: CurrencyCode.USD,
  customerId: 'cust_mock123',
  organizationId: 'org_mock123',
  livemode: true,
  createdAt: mockDate,
  taxAmount: 1599,
  subtotal: 18000,
} as Invoice.Record

const mockInvoiceLineItems = [
  {
    id: 'inv_li_mock1',
    invoiceId: 'inv_mock123',
    quantity: 1,
    description: 'Pro Plan - Monthly Subscription',
    price: 9900,
    type: SubscriptionItemType.Static,
    livemode: true,
  },
  {
    id: 'inv_li_mock2',
    invoiceId: 'inv_mock123',
    quantity: 1,
    description: 'API Usage - 10,000 requests',
    price: 4900,
    type: SubscriptionItemType.Usage,
    livemode: true,
  },
  {
    id: 'inv_li_mock3',
    invoiceId: 'inv_mock123',
    quantity: 2,
    description: 'Additional Team Seats',
    price: 1600,
    type: SubscriptionItemType.Static,
    livemode: true,
  },
] as InvoiceLineItem.Record[]

const MOCK_MERCHANT_NAME = 'Acme SaaS Inc.'
const MOCK_MERCHANT_LOGO =
  'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=128&h=128&fit=crop'

type EmailTemplate =
  | 'invoice-notification'
  | 'invoice-reminder'
  | 'order-receipt'

const InternalDemoPage = () => {
  const [isMoR, setIsMoR] = useState(true)
  const [selectedTemplate, setSelectedTemplate] =
    useState<EmailTemplate>('invoice-notification')

  const renderEmailTemplate = () => {
    switch (selectedTemplate) {
      case 'invoice-notification':
        return (
          <InvoiceNotificationEmail
            invoice={mockInvoice}
            invoiceLineItems={mockInvoiceLineItems}
            organizationName={MOCK_MERCHANT_NAME}
            organizationLogoUrl={MOCK_MERCHANT_LOGO}
            livemode={true}
            isMoR={isMoR}
          />
        )
      case 'invoice-reminder':
        return (
          <InvoiceReminderEmail
            invoice={mockInvoice}
            invoiceLineItems={mockInvoiceLineItems}
            organizationName={MOCK_MERCHANT_NAME}
            organizationLogoUrl={MOCK_MERCHANT_LOGO}
            livemode={true}
            isMoR={isMoR}
          />
        )
      case 'order-receipt':
        return (
          <OrderReceiptEmail
            invoiceNumber={mockInvoice.invoiceNumber}
            orderDate="December 28, 2024"
            invoice={{
              subtotal: mockInvoice.subtotal,
              taxAmount: mockInvoice.taxAmount,
              currency: mockInvoice.currency,
            }}
            lineItems={mockInvoiceLineItems.map((item) => ({
              name: item.description ?? '',
              price: item.price,
              quantity: item.quantity,
            }))}
            organizationName={MOCK_MERCHANT_NAME}
            organizationLogoUrl={MOCK_MERCHANT_LOGO}
            organizationId={mockInvoice.organizationId}
            customerId={mockInvoice.customerId}
            livemode={true}
            isMoR={isMoR}
          />
        )
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          MoR Email Template Preview
        </h1>

        {/* Controls */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <div className="flex flex-wrap items-center gap-6">
            {/* MoR Toggle */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isMoR}
                onChange={(e) => setIsMoR(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">
                Merchant of Record Mode
              </span>
            </label>

            {/* Template Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                Template:
              </span>
              <select
                value={selectedTemplate}
                onChange={(e) =>
                  setSelectedTemplate(e.target.value as EmailTemplate)
                }
                className="rounded border border-gray-300 px-3 py-1 text-sm"
              >
                <option value="invoice-notification">
                  Invoice Notification
                </option>
                <option value="invoice-reminder">
                  Invoice Reminder
                </option>
                <option value="order-receipt">Order Receipt</option>
              </select>
            </div>
          </div>

          {/* Info Banner */}
          <div className="mt-4 rounded bg-blue-50 p-3 text-sm text-blue-800">
            {isMoR ? (
              <>
                <strong>MoR Mode:</strong> Emails show Flowglad LLC as
                the seller with &quot;For: {MOCK_MERCHANT_NAME}&quot;
                branding. Card statement will show &quot;FLGLD*&quot;.
              </>
            ) : (
              <>
                <strong>Platform Mode:</strong> Emails show{' '}
                {MOCK_MERCHANT_NAME} as the seller with their own
                branding.
              </>
            )}
          </div>
        </div>

        {/* Email Preview */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
            <span className="text-xs font-medium text-gray-500">
              EMAIL PREVIEW
            </span>
          </div>
          <div className="p-0">{renderEmailTemplate()}</div>
        </div>
      </div>
    </div>
  )
}

export default InternalDemoPage
