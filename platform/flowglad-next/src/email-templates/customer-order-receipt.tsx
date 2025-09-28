import { CurrencyCode } from '@/types'
import { calculateInvoiceTotalsFromLineItems } from '@/utils/discountHelpers'
import * as React from 'react'
import { EmailButton } from './components/EmailButton'
import core from '@/utils/core'
import {
  EmailLayout,
  Header,
  DetailSection,
  DetailItem,
  LineItem,
  TotalSection,
  Signature,
  Paragraph,
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
}) => {
  const { originalAmount, subtotalAmount, taxAmount, totalAmount } =
    calculateInvoiceTotalsFromLineItems(
      invoice,
      lineItems,
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
    <EmailLayout previewText="Thanks for your order!">
      <Header
        title="Thanks for your order!"
        organizationLogoUrl={organizationLogoUrl}
      />

      <DetailSection>
        <DetailItem dataTestId="invoice-number">
          Invoice #: {invoiceNumber}
        </DetailItem>
        <DetailItem dataTestId="order-date">
          Date: {orderDate}
        </DetailItem>
        <DetailItem dataTestId="payment-amount">
          Payment: {totalAmount}
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
        originalAmount={originalAmount}
        subtotal={subtotalAmount}
        tax={taxAmount}
        total={totalAmount}
        discountInfo={discountInfoWithCurrency}
      />

      <Paragraph
        style={{ margin: '30px 0 10px' }}
        data-testid="thank-you-text"
      >
        Thanks for the purchase!
      </Paragraph>
      {/* TODO: create customer portal.... */}
      <EmailButton
        href={core.customerBillingPortalURL({
          organizationId,
          customerId,
        })}
        testId="view-order-button"
      >
        View Order →
      </EmailButton>

      <Signature
        greeting="Thanks,"
        name={organizationName}
        greetingDataTestId="signature-thanks"
        nameDataTestId="signature-org-name"
      />
    </EmailLayout>
  )
}

export default OrderReceiptEmail
