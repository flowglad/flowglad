import { CurrencyCode } from '@/types'
import { formatDate } from '@/utils/core'
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

export const PaymentFailedEmail = ({
  invoiceNumber,
  orderDate,
  lineItems,
  organizationName,
  organizationLogoUrl,
  retryDate,
  currency,
}: {
  currency: CurrencyCode
  invoiceNumber: string
  orderDate: Date
  organizationName: string
  organizationLogoUrl?: string
  lineItems: {
    name: string
    price: number
    quantity: number
  }[]
  retryDate?: Date
}) => {
  const totalAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      currency,
      lineItems.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      )
    )

  return (
    <EmailLayout previewText="Payment Failed for Your Order">
      <Header
        title="Payment Unsuccessful"
        organizationLogoUrl={organizationLogoUrl}
      />
      <Paragraph>
        We were unable to process your payment for the order below.
        Please check your payment information.
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
        <DetailItem>Amount: {totalAmount}</DetailItem>
      </DetailSection>

      {lineItems.map((item, index) => (
        <LineItem
          key={index}
          index={index}
          name={item.name}
          price={item.price}
          quantity={item.quantity}
          currency={currency}
        />
      ))}

      <TotalSection subtotal={totalAmount} total={totalAmount} />

      <Paragraph>
        If you continue to experience issues, please contact our
        support team for assistance.
      </Paragraph>
      <Signature greeting="Best," name={organizationName} />
    </EmailLayout>
  )
}

export default PaymentFailedEmail
