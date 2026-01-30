import type { CurrencyCode } from '@db-core/enums'
import * as React from 'react'
import { formatDate } from '@/utils/core'
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
  livemode,
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
  livemode: boolean
}) => {
  const totals = calculateInvoiceTotalsWithDiscounts(
    lineItems,
    invoice,
    discountInfo
  )

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

      <Footer
        organizationName={organizationName}
        variant="customer"
        billingPortalUrl={customerPortalUrl}
      />
    </EmailLayout>
  )
}

export default PaymentFailedEmail
