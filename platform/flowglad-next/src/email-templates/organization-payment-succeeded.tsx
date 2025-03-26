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

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : ''

export interface OrganizationPaymentNotificationEmailProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  currency: CurrencyCode
  customerId: string
}

export const OrganizationPaymentNotificationEmail = ({
  organizationName,
  amount,
  invoiceNumber,
  currency,
  customerId,
}: OrganizationPaymentNotificationEmailProps) => {
  const humanReadableAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      currency,
      amount
    )
  return (
    <Html>
      <Head />
      <Preview>Congratulations, {organizationName}!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={
              // TODO: add Flowglad logo
              `${baseUrl}/static/flowglad-logo.png`
            }
            width="100"
            height="100"
            alt="Flowglad Logo"
            style={logo}
          />
          <Heading style={h1}>Congratulations!</Heading>
          <Text style={text}>
            You&apos;ve just received a payment for $
            {humanReadableAmount}!
          </Text>
          <Section style={details}>
            <Text style={detailsText}>Payment</Text>
            <Text style={detailsValue}>{humanReadableAmount}</Text>
            <Text style={detailsText}>Status</Text>
            <Text style={detailsValue}>Paid</Text>
            {invoiceNumber && (
              <>
                <Text style={detailsText}>Invoice #</Text>
                <Text style={detailsValue}>{invoiceNumber}</Text>
              </>
            )}
          </Section>
          <Section style={buttonContainer}>
            <Link
              style={button}
              href={`https://app.flowglad.com/customers/${customerId}`}
            >
              View in Dashboard
            </Link>
          </Section>
          <Text style={footerText}>
            This payment was processed by Flowglad on behalf of{' '}
            {organizationName}.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

const logo = {
  margin: '0 auto',
  marginBottom: '32px',
}

const h1 = {
  color: '#32325d',
  fontSize: '24px',
  fontWeight: 'normal',
  textAlign: 'center' as const,
  margin: '30px 0',
}

const text = {
  color: '#525f7f',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'center' as const,
}

const details = {
  backgroundColor: '#f6f9fc',
  borderRadius: '4px',
  marginTop: '30px',
  padding: '24px',
}

const detailsText = {
  color: '#525f7f',
  fontSize: '14px',
  marginBottom: '4px',
}

const detailsValue = {
  color: '#32325d',
  fontSize: '16px',
  fontWeight: 'bold',
  marginBottom: '16px',
}

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '32px',
}

const button = {
  backgroundColor: '#000',
  borderRadius: '4px',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '100%',
}

const footerText = {
  color: '#525f7f',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'center' as const,
  marginTop: '24px',
}
