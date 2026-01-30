import type { CurrencyCode } from '@db-core/enums'
import * as React from 'react'
import { FLOWGLAD_LEGAL_ENTITY } from '@/constants/mor'
import core from '@/utils/core'
import { calculateInvoiceTotalsWithDiscounts } from '@/utils/discountHelpers'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Footer,
  Header,
  LineItem,
  Paragraph,
  Signature,
  TotalSection,
} from './components/themed'

export const OrderReceiptEmail = ({
  invoiceNumber,
  orderDate,
  invoice,
  lineItems,
  organizationLogoUrl,
  organizationName,
  organizationId,
  customerId,
  discountInfo,
  livemode,
  isMoR,
}: {
  invoiceNumber: string
  orderDate: string
  invoice: {
    subtotal: number | null
    taxAmount: number | null
    currency: CurrencyCode
  }
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  lineItems: {
    name: string
    price: number
    quantity: number
  }[]
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
  const totals = calculateInvoiceTotalsWithDiscounts(
    lineItems,
    invoice,
    discountInfo
  )

  // MoR branding: use Flowglad logo and name as seller
  const sellerName = isMoR
    ? FLOWGLAD_LEGAL_ENTITY.name
    : organizationName
  const sellerLogo = isMoR
    ? FLOWGLAD_LEGAL_ENTITY.logoURL
    : organizationLogoUrl
  const previewText = isMoR
    ? `Thanks for your order with ${organizationName}!`
    : 'Thanks for your order!'
  const signatureName = isMoR
    ? `${sellerName} for ${organizationName}`
    : organizationName

  return (
    <EmailLayout previewText={previewText}>
      <TestModeBanner livemode={livemode} />
      <Header
        title="Your Order is Confirmed"
        organizationLogoUrl={sellerLogo}
      />

      <DetailSection>
        <DetailItem dataTestId="invoice-number">
          Invoice #: {invoiceNumber}
        </DetailItem>
        <DetailItem dataTestId="order-date">
          Date: {orderDate}
        </DetailItem>
        <DetailItem dataTestId="payment-amount">
          Payment: {totals.totalAmount}
        </DetailItem>
      </DetailSection>

      {lineItems.map((item, index) => (
        <LineItem
          key={index}
          index={index}
          name={item.name}
          price={item.price}
          quantity={item.quantity}
          currency={invoice.currency}
        />
      ))}

      <TotalSection
        originalAmount={totals.originalAmount}
        subtotal={totals.subtotalAmount}
        tax={totals.taxAmount}
        total={totals.totalAmount}
        discountInfo={totals.discountInfoWithCurrency}
      />

      <Paragraph
        style={{ margin: '30px 0 10px' }}
        data-testid="thank-you-text"
      >
        Thanks for the purchase!
      </Paragraph>
      {/* FIXME: create customer portal.... */}
      <EmailButton
        href={core.customerBillingPortalURL({
          organizationId,
          customerId,
        })}
      >
        View Order →
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

      <Signature
        greeting="Thanks,"
        name={signatureName}
        greetingDataTestId="signature-thanks"
        nameDataTestId="signature-org-name"
      />

      <Footer
        organizationName={organizationName}
        variant="customer"
        billingPortalUrl={core.customerBillingPortalURL({
          organizationId,
          customerId,
        })}
      />
    </EmailLayout>
  )
}

export default OrderReceiptEmail
