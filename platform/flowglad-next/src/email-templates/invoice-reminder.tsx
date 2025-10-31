import { calculateInvoiceTotalsFromLineItems } from '@/utils/discountHelpers'
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
import core from '@/utils/core'
import TestModeBanner from './components/TestBanner'

const baseUrl = process.env.VERCEL_URL || core.NEXT_PUBLIC_APP_URL

export const InvoiceReminderEmail = ({
  invoice,
  invoiceLineItems,
  organizationLogoUrl,
  organizationName,
  discountInfo,
}: {
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationLogoUrl?: string
  organizationName: string
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
  } | null
}) => {
  const { originalAmount, subtotalAmount, taxAmount, totalAmount } =
    calculateInvoiceTotalsFromLineItems(
      invoice,
      invoiceLineItems,
      discountInfo
    )

  // Prepare discount info with currency for TotalSection
  const discountInfoWithCurrency = discountInfo
    ? {
        ...discountInfo,
        currency: invoice.currency,
      }
    : null

  return (
    <EmailLayout previewText="Invoice Reminder">
      <TestModeBanner livemode={livemode} />
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
        originalAmount={originalAmount}
        subtotal={subtotalAmount}
        tax={taxAmount}
        total={totalAmount}
        totalLabelText="Total Amount Due"
        discountInfo={discountInfoWithCurrency}
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
