import { CurrencyCode } from '@/types'
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

export const OrderReceiptEmail = ({
  invoiceNumber,
  orderDate,
  lineItems,
  organizationLogoUrl,
  organizationName,
  currency,
  organizationId,
  customerId,
}: {
  invoiceNumber: string
  orderDate: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  lineItems: {
    name: string
    price: number
    quantity: number
  }[]
  currency: CurrencyCode
  organizationName: string
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
          currency={currency}
        />
      ))}

      <TotalSection subtotal={totalAmount} total={totalAmount} />

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
