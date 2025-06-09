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
import {
  EmailLayout,
  Header,
  Paragraph,
  DetailSection,
  DetailItem,
} from './components/themed'

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

const detailsValue = {
  color: '#32325d',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  marginBottom: '16px',
}

export const OrganizationSubscriptionCreatedNotificationEmail = ({
  organizationName,
  subscriptionName,
  customerId,
  customerName,
  customerEmail,
}: OrganizationSubscriptionCreatedNotificationEmailProps) => {
  return (
    <EmailLayout
      previewText={`New Subscription: ${customerName} subscribed to ${subscriptionName}`}
      variant="organization"
    >
      <Img
        src={`https://cdn-flowglad.com/flowglad-banner-rounded.png`}
        width="540"
        height="199"
        alt="Flowglad Logo"
        style={{ margin: '0 auto', marginBottom: '32px' }}
      />
      <Header
        title="New Subscription"
        style={{ textAlign: 'center', fontWeight: 'normal' }}
      />
      <Paragraph
        style={{
          color: '#525f7f',
          textAlign: 'center',
          margin: 0,
        }}
      >
        A new customer has subscribed to your {subscriptionName} plan.
      </Paragraph>
      <DetailSection>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Customer Name
        </DetailItem>
        <Text style={detailsValue}>{customerName}</Text>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Customer Email
        </DetailItem>
        <Text style={detailsValue}>{customerEmail}</Text>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Subscription
        </DetailItem>
        <Text style={detailsValue}>{subscriptionName}</Text>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Status
        </DetailItem>
        <Text style={detailsValue}>Active</Text>
      </DetailSection>
      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <EmailButton
          href={`https://app.flowglad.com/customers/${customerId}`}
        >
          View Customer Profile
        </EmailButton>
      </Section>
      <Paragraph
        style={{
          color: '#525f7f',
          lineHeight: '20px',
          textAlign: 'center',
          marginTop: '24px',
        }}
      >
        {`You can manage this customer's subscription and access their information through your dashboard.`}
      </Paragraph>
    </EmailLayout>
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
    <EmailLayout
      previewText={`Subscription Cancelled: ${customerName} canceled ${subscriptionName}`}
      variant="organization"
    >
      <Img
        src={`https://cdn-flowglad.com/flowglad-banner-rounded.png`}
        width="540"
        height="199"
        alt="Flowglad Logo"
        style={{ margin: '0 auto', marginBottom: '32px' }}
      />
      <Header
        title="Subscription Cancellation Alert"
        style={{ textAlign: 'center', fontWeight: 'normal' }}
      />
      <Paragraph
        style={{
          color: '#525f7f',
          textAlign: 'center',
          margin: 0,
        }}
      >
        A customer has canceled their subscription to your{' '}
        {subscriptionName} plan.
      </Paragraph>
      <DetailSection>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Customer Name
        </DetailItem>
        <Text style={detailsValue}>{customerName}</Text>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Customer Email
        </DetailItem>
        <Text style={detailsValue}>{customerEmail}</Text>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Subscription
        </DetailItem>
        <Text style={detailsValue}>{subscriptionName}</Text>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Cancellation Date
        </DetailItem>
        <Text style={detailsValue}>
          {cancellationDate.toLocaleDateString()}
        </Text>
      </DetailSection>
      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <EmailButton
          href={`https://app.flowglad.com/customers/${customerId}`}
        >
          View Customer Profile
        </EmailButton>
      </Section>
      <Paragraph
        style={{
          color: '#525f7f',
          lineHeight: '20px',
          textAlign: 'center',
          marginTop: '24px',
        }}
      >
        {`You can review this customer's history and manage their account through your dashboard.`}
      </Paragraph>
    </EmailLayout>
  )
}
