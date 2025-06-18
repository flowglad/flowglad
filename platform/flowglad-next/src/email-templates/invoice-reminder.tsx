import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import * as React from 'react'
import { Invoice } from '@/db/schema/invoices'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { EmailButton } from './components/EmailButton'
import {
  EmailLayout,
  Header,
  DetailSection,
  DetailItem,
  TotalSection,
  Paragraph,
  Signature,
} from './components/themed'

const baseUrl =
  process.env.VERCEL_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://localhost:3000'

export const InvoiceReminderEmail = ({
  invoice,
  invoiceLineItems,
  organizationLogoUrl,
  organizationName,
}: {
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationLogoUrl?: string
  organizationName: string
}) => {
  const totalAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      invoice.currency,
      invoiceLineItems.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      )
    )

  return (
    <EmailLayout previewText="Invoice Reminder">
      <Header
        title="Invoice Reminder"
        organizationLogoUrl={organizationLogoUrl}
      />

      <DetailSection>
        <DetailItem>Invoice #: {invoice.invoiceNumber}</DetailItem>
        <DetailItem>
          Date: {new Date(invoice.invoiceDate).toLocaleDateString()}
        </DetailItem>
        <DetailItem>
          Due Date:{' '}
          {invoice.dueDate
            ? new Date(invoice.dueDate).toLocaleDateString()
            : 'Upon Receipt'}
        </DetailItem>
        <DetailItem>Amount Due: {totalAmount}</DetailItem>
      </DetailSection>

      <TotalSection
        subtotal={totalAmount}
        total={totalAmount}
        showSubtotal={false}
        totalLabelText="Total Amount Due"
      />

      <Paragraph style={{ margin: '30px 0 10px' }}>
        Please process payment at your earliest convenience.
      </Paragraph>
      <EmailButton href={`${baseUrl}/invoices/${invoice.id}`}>
        View Invoice →
      </EmailButton>

      <Signature greeting="Best regards," name={organizationName} />
    </EmailLayout>
  )
}

export default InvoiceReminderEmail
