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
export interface OrganizationPaymentConfirmationEmailProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  customerId: string
  currency: CurrencyCode
}
export const OrganizationPaymentConfirmationEmail = ({
  organizationName,
  amount,
  invoiceNumber,
  customerId,
  currency,
}: OrganizationPaymentConfirmationEmailProps) => {
  const humanReadableAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      currency,
      amount
    )
  return (
    <Html>
      <Head />
      <Preview>Awaiting Confirmation for Payment</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={
              // TODO: add Flowglad logo
              `${baseUrl}/static/flowglad-logo.png`
            }
            width="49"
            height="21"
            alt="Flowglad Logo"
            style={logo}
          />
          <Heading style={h1}>Payment Pending Confirmation</Heading>
          <Text style={text}>
            A payment of ${humanReadableAmount} is awaiting
            confirmation. We will notify you once the payment has been
            successfully processed.
          </Text>
          <Section style={details}>
            <Text style={detailsText}>Payment</Text>
            <Text style={detailsValue}>${humanReadableAmount}</Text>
            <Text style={detailsText}>Status</Text>
            <Text style={detailsValue}>Pending Confirmation</Text>
            <Text style={detailsText}>Invoice #</Text>
            <Text style={detailsValue}>{invoiceNumber}</Text>
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
            This payment is being processed by Flowglad on behalf of{' '}
            {organizationName}. You will receive another notification
            once the payment is confirmed.
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
  backgroundColor: '#6772e5',
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
