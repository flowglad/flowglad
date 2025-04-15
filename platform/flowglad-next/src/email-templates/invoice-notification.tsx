import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'
import { Invoice } from '@/db/schema/invoices'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { EmailButton } from './components/EmailButton'

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : ''

export const InvoiceNotificationEmail = ({
  invoice,
  invoiceLineItems,
  organizationLogoUrl,
  organizationName,
}: {
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  organizationLogoUrl?: string
  organizationName: string
}) => {
  const totalAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      invoice.currency,
      invoiceLineItems.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      )
    )

  return (
    <Html>
      <Head />
      <Preview>New Invoice from {organizationName}</Preview>
      <Body style={main}>
        <Container style={container}>
          {organizationLogoUrl && (
            <Section style={logoContainer}>
              <Img
                src={organizationLogoUrl}
                width="50"
                height="50"
                alt="Logo"
              />
            </Section>
          )}

          <Heading style={h1}>New Invoice</Heading>

          <Section style={orderDetails}>
            <Text style={orderItem}>
              Invoice #: {invoice.invoiceNumber}
            </Text>
            <Text style={orderItem}>
              Date:{' '}
              {new Date(invoice.invoiceDate).toLocaleDateString()}
            </Text>
            <Text style={orderItem}>
              Due Date:{' '}
              {invoice.dueDate
                ? new Date(invoice.dueDate).toLocaleDateString()
                : 'Upon Receipt'}
            </Text>
            <Text style={orderItem}>Amount Due: {totalAmount}</Text>
          </Section>

          <Hr style={hr} />

          <Section style={totalSection}>
            <Text style={totalLabel}>Total Amount Due</Text>
            <Text style={totalAmountStyle}>{totalAmount}</Text>
          </Section>

          <Text style={thankYouText}>
            Please review and process payment at your earliest
            convenience.
          </Text>
          <EmailButton
            href={`${baseUrl}/invoice/view/${invoice.organizationId}/${invoice.id}`}
          >
            View Invoice →
          </EmailButton>

          <Text style={signature}>Best regards,</Text>
          <Text style={signature}>{organizationName}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default InvoiceNotificationEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  width: '580px',
}

const logoContainer = {
  marginBottom: '24px',
}

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '30px 0',
  padding: '0',
  lineHeight: '42px',
}

const orderDetails = {
  margin: '30px 0',
}

const orderItem = {
  margin: '8px 0',
  color: '#333',
  fontSize: '14px',
}

const hr = {
  borderColor: '#cccccc',
  margin: '20px 0',
}

const totalSection = {
  margin: '20px 0',
}

const totalLabel = {
  fontSize: '14px',
  fontWeight: 'bold',
  margin: '8px 0',
}

const totalAmountStyle = {
  fontSize: '14px',
  margin: '8px 0',
}

const thankYouText = {
  fontSize: '14px',
  margin: '30px 0 10px',
}

const signature = {
  fontSize: '14px',
  margin: '0 0 4px',
}
