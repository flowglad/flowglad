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
            <EmailButton
              href={`https://app.flowglad.com/customers/${customerId}`}
            >
              View in Dashboard
            </EmailButton>
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
