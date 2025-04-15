import { CurrencyCode } from '@/types'
import { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import {
  Body,
  Button,
  Container,
  Column,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : ''

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
    <Html>
      <Head />
      <Preview>Payment Failed for Your Order</Preview>
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

          <Heading style={h1}>Payment Unsuccessful</Heading>
          <Text style={paragraph}>
            We were unable to process your payment for the order
            below. Please check your payment information.
          </Text>
          {retryDate ? (
            <Text style={paragraph}>
              We will retry on {formatDate(retryDate)} with the same
              payment method.
            </Text>
          ) : (
            <Text style={paragraph}>
              We will no longer attempt to retry the payment. Please
              reach out to us to get this sorted.
            </Text>
          )}
          <Section style={orderDetails}>
            <Text style={orderItem}>Invoice #: {invoiceNumber}</Text>
            <Text style={orderItem}>
              Date: {formatDate(orderDate)}
            </Text>
            <Text style={orderItem}>Amount: {totalAmount}</Text>
          </Section>

          {lineItems.map((item, index) => (
            <Section style={productDetails} key={index}>
              <Row>
                <Column>
                  <Text style={productNameStyle}>{item.name}</Text>
                  <Text style={productPriceStyle}>
                    {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                      currency,
                      item.price
                    )}
                  </Text>
                  <Text style={productQuantityStyle}>
                    Quantity: {item.quantity}
                  </Text>
                </Column>
              </Row>
            </Section>
          ))}

          <Hr style={hr} />

          <Section style={totalSection}>
            <Text style={totalLabel}>Subtotal</Text>
            <Text style={totalAmountStyle}>{totalAmount}</Text>
            <Text style={totalLabel}>Total</Text>
            <Text style={totalAmountStyle}>{totalAmount}</Text>
          </Section>

          <Text style={paragraph}>
            If you continue to experience issues, please contact our
            support team for assistance.
          </Text>
          <Text style={signature}>Best,</Text>
          <Text style={signature}>{organizationName}</Text>

          {/* <Text style={footerText}>
            Need help?{' '}
            <Link
              href="https://example.com/contact-support"
              style={link}
            >
              Contact Support
            </Link>
          </Text> */}
        </Container>
      </Body>
    </Html>
  )
}

export default PaymentFailedEmail

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

const paragraph = {
  color: '#333',
  fontSize: '14px',
  margin: '0 0 20px',
}

const orderDetails = {
  margin: '30px 0',
}

const orderItem = {
  margin: '8px 0',
  color: '#333',
  fontSize: '14px',
}

const productDetails = {
  marginBottom: '30px',
}

const productNameStyle = {
  fontSize: '14px',
  fontWeight: 'bold',
  margin: '0',
}

const productPriceStyle = {
  fontSize: '14px',
  margin: '4px 0 0',
}

const productQuantityStyle = {
  fontSize: '14px',
  margin: '4px 0 0',
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

const signature = {
  fontSize: '14px',
  margin: '0 0 4px',
}

const footerText = {
  fontSize: '12px',
  color: '#999',
  margin: '20px 0 0',
}

const link = {
  color: '#2754C5',
  fontSize: '14px',
  textDecoration: 'underline',
}
