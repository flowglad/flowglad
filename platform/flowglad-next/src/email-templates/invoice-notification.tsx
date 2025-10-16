import { calculateInvoiceTotalsFromLineItems } from '@/utils/discountHelpers'
import * as React from 'react'
import { Invoice } from '@/db/schema/invoices'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { EmailButton } from './components/EmailButton'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Header,
  Paragraph,
  Signature,
  TotalSection,
} from './components/themed'
import { emailBaseUrl } from '@/utils/core'
import TestModeBanner from './components/TestBanner'

export const InvoiceNotificationEmail = ({
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
    <EmailLayout previewText={`New Invoice from ${organizationName}`}>
      <TestModeBanner><TestModeBanner/>
      <Header
        title="New Invoice"
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
        Please review and process payment at your earliest
        convenience.
      </Paragraph>
      <EmailButton
        href={`${emailBaseUrl}/invoice/view/${invoice.organizationId}/${invoice.id}`}
      >
        View Invoice →
      </EmailButton>

      <Signature greeting="Best regards," name={organizationName} />
    </EmailLayout>
  )
}

export default InvoiceNotificationEmail
