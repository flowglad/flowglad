import { CurrencyCode } from '@/types'
import { formatDate } from '@/utils/core'
import { calculateInvoiceTotalsWithDiscounts } from '@/utils/discountHelpers'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import * as React from 'react'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Header,
  LineItem,
  Paragraph,
  Signature,
  TotalSection,
} from './components/themed'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'

export const PaymentFailedEmail = ({
  invoiceNumber,
  orderDate,
  invoice,
  lineItems,
  organizationName,
  organizationLogoUrl,
  retryDate,
  discountInfo,
  failureReason,
  customerPortalUrl,
}: {
  invoiceNumber: string
  orderDate: Date
  invoice: {
    subtotal: number | null
    taxAmount: number | null
    currency: CurrencyCode
  }
  organizationName: string
  organizationLogoUrl?: string
  lineItems: {
    name: string
    price: number
    quantity: number
  }[]
  retryDate?: Date
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
  } | null
  failureReason?: string
  customerPortalUrl?: string
}) => {
  const totals = calculateInvoiceTotalsWithDiscounts(lineItems, invoice, discountInfo)

  return (
    <EmailLayout previewText="Payment Failed for Your Order">
      <TestModeBanner livemode={livemode} />
      <Header
        title="Payment Unsuccessful"
        organizationLogoUrl={organizationLogoUrl}
      />
      <Paragraph>
        We were unable to process your payment for the order below.
        <br />
        {failureReason && (
          <>
            <br />
            <strong>Reason:</strong> {failureReason}
          </>
        )}
      </Paragraph>
      {retryDate ? (
        <Paragraph>
          We will retry on {formatDate(retryDate)} with the same
          payment method.
        </Paragraph>
      ) : (
        <Paragraph>
          We will no longer attempt to retry the payment. Please reach
          out to us to get this sorted.
        </Paragraph>
      )}
      <DetailSection>
        <DetailItem>Invoice #: {invoiceNumber}</DetailItem>
        <DetailItem>Date: {formatDate(orderDate)}</DetailItem>
        <DetailItem>Amount: {totals.totalAmount}</DetailItem>
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

      {customerPortalUrl && (
        <EmailButton href={customerPortalUrl}>
          Update Payment Method
        </EmailButton>
      )}

      <Paragraph>
        If you continue to experience issues, please contact our
        support team for assistance.
      </Paragraph>
      <Signature greeting="Best," name={organizationName} />
    </EmailLayout>
  )
}

export default PaymentFailedEmail
