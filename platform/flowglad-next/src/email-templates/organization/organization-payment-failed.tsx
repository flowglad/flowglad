import { CurrencyCode } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'
import { EmailButton } from '../components/EmailButton'
import {
  main,
  container,
  logo,
  h1,
  text,
  details,
  detailsText,
  detailsValue,
  buttonContainer,
  footerText,
} from '@/email-templates/styles/coreEmailStyles'

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : ''

export interface OrganizationPaymentFailedNotificationEmailProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  currency: CurrencyCode
  customerId: string
}

export const OrganizationPaymentFailedNotificationEmail = ({
  organizationName,
  amount,
  invoiceNumber,
  currency,
  customerId,
}: OrganizationPaymentFailedNotificationEmailProps) => {
  const humanReadableAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      currency,
      amount
    )
  return (
    <Html>
      <Head />
      <Preview>Payment Failed - Action Required</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={`https://cdn-flowglad.com/flowglad-banner-rounded.png`}
            width="543"
            height="200"
            alt="Flowglad Logo"
            style={logo}
          />
          <Heading style={h1}>Payment Failed</Heading>
          <Text style={text}>
            A payment of ${humanReadableAmount} has failed to process.
            Please review your payment details and try again.
          </Text>
          <Section style={details}>
            <Text style={detailsText}>Payment</Text>
            <Text style={detailsValue}>{humanReadableAmount}</Text>
            <Text style={detailsText}>Status</Text>
            <Text style={detailsValue}>Failed</Text>
            {invoiceNumber && (
              <>
                <Text style={detailsText}>Invoice #</Text>
                <Text style={detailsValue}>{invoiceNumber}</Text>
              </>
            )}
          </Section>
          <Section style={buttonContainer}>
            <EmailButton
              href={`https://app.flowglad.com/customers/${customerId}`}
            >
              View in Dashboard
            </EmailButton>
          </Section>
          <Text style={footerText}>
            This payment was attempted to be processed by Flowglad on
            behalf of {organizationName}. Please update your payment
            information to ensure future transactions are successful.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
