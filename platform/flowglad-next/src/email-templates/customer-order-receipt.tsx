import { CurrencyCode, DiscountAmountType } from '@/types'
import { calculateInvoiceTotalsWithDiscounts } from '@/utils/discountHelpers'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
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
import TestModeBanner from './components/TestBanner'

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
  const totals = calculateInvoiceTotalsWithDiscounts(lineItems, invoice, discountInfo)

  return (
    <EmailLayout previewText="Thanks for your order!">
      <TestModeBanner><TestModeBanner/>
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
