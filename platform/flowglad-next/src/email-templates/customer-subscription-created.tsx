import { CurrencyCode, IntervalUnit } from '@/types'
import { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import * as React from 'react'
import { EmailButton } from './components/EmailButton'
import core from '@/utils/core'
import {
  EmailLayout,
  Header,
  DetailSection,
  DetailItem,
  Paragraph,
  Signature,
} from './components/themed'

export const CustomerSubscriptionCreatedEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  customerExternalId,
  planName,
  price,
  currency,
  interval,
  nextBillingDate,
  paymentMethodLast4,
}: {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerExternalId: string
  planName: string
  price: number
  currency: CurrencyCode
  interval: IntervalUnit
  nextBillingDate: Date
  paymentMethodLast4?: string
}) => {
  const formattedPrice =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(currency, price)
  const intervalText = interval === 'month' ? 'month' : 'year'

  return (
    <EmailLayout previewText="Payment method confirmed - Subscription active">
      <Header
        title="Payment method confirmed"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>Your subscription has been activated.</Paragraph>

      <DetailSection>
        <DetailItem dataTestId="plan-name">
          Plan: {planName}
        </DetailItem>
        <DetailItem dataTestId="price">
          Price: {formattedPrice}/{intervalText}
        </DetailItem>
        <DetailItem dataTestId="next-billing-date">
          Next billing date: {formatDate(nextBillingDate)}
        </DetailItem>
        {paymentMethodLast4 && (
          <DetailItem dataTestId="payment-method">
            Payment method: •••• {paymentMethodLast4}
          </DetailItem>
        )}
      </DetailSection>

      <Paragraph style={{ marginTop: '24px' }}>
        The payment method
        {paymentMethodLast4
          ? ` ending in ${paymentMethodLast4}`
          : ''}{' '}
        will be used for future charges.
      </Paragraph>

      <Paragraph style={{ marginTop: '16px' }}>
        You can manage your subscription and payment methods at any
        time through your billing portal.
      </Paragraph>

      <EmailButton
        href={core.billingPortalPageURL({
          organizationId,
          customerExternalId,
          page: 'sign-in',
        })}
        testId="manage-subscription-button"
      >
        Manage Subscription →
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

export default CustomerSubscriptionCreatedEmail
