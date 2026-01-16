import * as React from 'react'
import { type CurrencyCode, IntervalUnit } from '@/types'
import core, { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Header,
  Paragraph,
  Signature,
} from './components/themed'

export interface CustomerTrialEndingSoonEmailProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  planName: string
  trialEndDate: Date
  daysRemaining: number
  price: number
  currency: CurrencyCode
  interval?: IntervalUnit
  hasPaymentMethod: boolean
  livemode: boolean
}

const getIntervalText = (intervalUnit?: IntervalUnit) => {
  if (!intervalUnit) return null
  switch (intervalUnit) {
    case IntervalUnit.Day:
      return 'day'
    case IntervalUnit.Week:
      return 'week'
    case IntervalUnit.Month:
      return 'month'
    case IntervalUnit.Year:
      return 'year'
    default:
      return null
  }
}

export const CustomerTrialEndingSoonEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  customerId,
  planName,
  trialEndDate,
  daysRemaining,
  price,
  currency,
  interval,
  hasPaymentMethod,
  livemode,
}: CustomerTrialEndingSoonEmailProps) => {
  const formattedPrice =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(currency, price)

  const formattedPriceWithInterval = interval
    ? `${formattedPrice}/${getIntervalText(interval)}`
    : formattedPrice

  const subjectText =
    daysRemaining === 1
      ? 'Your Trial Ends Tomorrow'
      : `Your Trial Ends in ${daysRemaining} Days`

  return (
    <EmailLayout previewText={subjectText}>
      <TestModeBanner livemode={livemode} />
      <Header
        title="Trial Ending Soon"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>
        Your free trial for {planName} ends on{' '}
        {formatDate(trialEndDate)}.
      </Paragraph>

      <DetailSection>
        <DetailItem dataTestId="plan-name">
          Plan: {planName}
        </DetailItem>
        <DetailItem dataTestId="trial-end-date">
          Trial ends: {formatDate(trialEndDate)}
        </DetailItem>
        {hasPaymentMethod && (
          <DetailItem dataTestId="first-charge">
            First charge: {formattedPriceWithInterval}
          </DetailItem>
        )}
      </DetailSection>

      {hasPaymentMethod ? (
        <>
          <Paragraph style={{ marginTop: '24px' }}>
            Starting {formatDate(trialEndDate)}, you'll be charged{' '}
            {formattedPriceWithInterval}.
          </Paragraph>
          <Paragraph style={{ marginTop: '16px' }}>
            To avoid being charged, cancel at least a day before{' '}
            {formatDate(trialEndDate)}. To keep your subscription, no
            action is needed.
          </Paragraph>
          <EmailButton
            href={core.customerBillingPortalURL({
              organizationId,
              customerId,
            })}
            testId="manage-subscription-button"
          >
            Manage Subscription →
          </EmailButton>
        </>
      ) : (
        <>
          <Paragraph style={{ marginTop: '24px' }}>
            To continue using {planName} after your trial, please add
            a payment method.
          </Paragraph>
          <Paragraph style={{ marginTop: '16px' }}>
            If you don't add a payment method before your trial ends,
            your subscription will become inactive.
          </Paragraph>
          <EmailButton
            href={core.customerBillingPortalURL({
              organizationId,
              customerId,
            })}
            testId="add-payment-method-button"
          >
            Add Payment Method →
          </EmailButton>
        </>
      )}

      <Signature
        greeting="Thanks,"
        name={organizationName}
        greetingDataTestId="signature-thanks"
        nameDataTestId="signature-org-name"
      />
    </EmailLayout>
  )
}

export default CustomerTrialEndingSoonEmail
