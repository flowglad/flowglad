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
import { EmailButton } from './components/EmailButton'

export interface OrganizationSubscriptionCreatedNotificationEmailProps {
  organizationName: string
  subscriptionName: string
  customerId: string
  customerName: string
  customerEmail: string
}

export interface OrganizationSubscriptionCanceledNotificationEmailProps {
  organizationName: string
  subscriptionName: string
  customerId: string
  customerName: string
  customerEmail: string
  cancellationDate: Date
}

export const OrganizationSubscriptionCreatedNotificationEmail = ({
  organizationName,
  subscriptionName,
  customerId,
  customerName,
  customerEmail,
}: OrganizationSubscriptionCreatedNotificationEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>
        New Subscription: {customerName} subscribed to{' '}
        {subscriptionName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={`https://cdn-flowglad.com/flowglad-banner-rounded.png`}
            width="543"
            height="200"
            alt="Flowglad Logo"
            style={logo}
          />
          <Heading style={h1}>New Subscription</Heading>
          <Text style={text}>
            A new customer has subscribed to your {subscriptionName}{' '}
            plan.
          </Text>
          <Section style={details}>
            <Text style={detailsText}>Customer Name</Text>
            <Text style={detailsValue}>{customerName}</Text>
            <Text style={detailsText}>Customer Email</Text>
            <Text style={detailsValue}>{customerEmail}</Text>
            <Text style={detailsText}>Subscription</Text>
            <Text style={detailsValue}>{subscriptionName}</Text>
            <Text style={detailsText}>Status</Text>
            <Text style={detailsValue}>Active</Text>
          </Section>
          <Section style={buttonContainer}>
            <EmailButton
              href={`https://app.flowglad.com/customers/${customerId}`}
            >
              View Customer Profile
            </EmailButton>
          </Section>
          <Text style={footerText}>
            {`You can manage this customer's subscription and access their information through your dashboard.`}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const OrganizationSubscriptionCanceledNotificationEmail = ({
  organizationName,
  subscriptionName,
  customerId,
  customerName,
  customerEmail,
  cancellationDate,
}: OrganizationSubscriptionCanceledNotificationEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>
        Subscription Cancelled: {customerName} cancelled{' '}
        {subscriptionName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={`https://cdn-flowglad.com/flowglad-banner-rounded.png`}
            width="543"
            height="200"
            alt="Flowglad Logo"
            style={logo}
          />
          <Heading style={h1}>
            Subscription Cancellation Alert
          </Heading>
          <Text style={text}>
            A customer has cancelled their subscription to your{' '}
            {subscriptionName} plan.
          </Text>
          <Section style={details}>
            <Text style={detailsText}>Customer Name</Text>
            <Text style={detailsValue}>{customerName}</Text>
            <Text style={detailsText}>Customer Email</Text>
            <Text style={detailsValue}>{customerEmail}</Text>
            <Text style={detailsText}>Subscription</Text>
            <Text style={detailsValue}>{subscriptionName}</Text>
            <Text style={detailsText}>Cancellation Date</Text>
            <Text style={detailsValue}>
              {cancellationDate.toLocaleDateString()}
            </Text>
          </Section>
          <Section style={buttonContainer}>
            <EmailButton
              href={`https://app.flowglad.com/customers/${customerId}`}
            >
              View Customer Profile
            </EmailButton>
          </Section>
          <Text style={footerText}>
            {`You can review this customer's history and manage their account through your dashboard.`}
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
  backgroundColor: '#f6f9fc',
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

const footerText = {
  color: '#525f7f',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'center' as const,
  marginTop: '24px',
}
