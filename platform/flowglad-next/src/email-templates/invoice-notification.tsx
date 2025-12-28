import * as React from 'react'
import { FLOWGLAD_LEGAL_ENTITY } from '@/constants/mor'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import { emailBaseUrl } from '@/utils/core'
import { calculateInvoiceTotalsFromLineItems } from '@/utils/discountHelpers'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Header,
  Paragraph,
  Signature,
  TotalSection,
} from './components/themed'

export const InvoiceNotificationEmail = ({
  invoice,
  invoiceLineItems,
  organizationLogoUrl,
  organizationName,
  discountInfo,
  livemode,
  isMoR,
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
  livemode: boolean
  /** Whether this is a Merchant of Record invoice (Flowglad as seller) */
  isMoR?: boolean
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

  // MoR branding: use Flowglad logo and name as seller
  const sellerName = isMoR
    ? FLOWGLAD_LEGAL_ENTITY.name
    : organizationName
  const sellerLogo = isMoR
    ? FLOWGLAD_LEGAL_ENTITY.logoURL
    : organizationLogoUrl
  const previewText = isMoR
    ? `New Invoice from ${sellerName} for ${organizationName}`
    : `New Invoice from ${organizationName}`
  const signatureName = isMoR
    ? `${sellerName} for ${organizationName}`
    : organizationName

  return (
    <EmailLayout previewText={previewText}>
      <TestModeBanner livemode={livemode} />
      <Header title="New Invoice" organizationLogoUrl={sellerLogo} />
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

      {isMoR && (
        <Paragraph
          style={{
            fontSize: '12px',
            color: '#666',
            marginTop: '20px',
          }}
        >
          This purchase was processed by {FLOWGLAD_LEGAL_ENTITY.name}{' '}
          for {organizationName}. You may see "
          {FLOWGLAD_LEGAL_ENTITY.cardStatementDescriptor}" on your
          card statement.
        </Paragraph>
      )}

      <Signature greeting="Best regards," name={signatureName} />
    </EmailLayout>
  )
}

export default InvoiceNotificationEmail
