import { Img, Section, Text } from '@react-email/components'
import * as React from 'react'
import { emailBaseUrl } from '@/utils/core'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Footer,
  Header,
  Paragraph,
} from './components/themed'

export interface OrganizationSubscriptionCreatedNotificationEmailProps {
  organizationName: string
  subscriptionName: string
  customerId: string
  customerName: string
  customerEmail: string
  livemode: boolean
}

export interface OrganizationSubscriptionCanceledNotificationEmailProps {
  organizationName: string
  subscriptionName: string
  customerId: string
  customerName: string
  customerEmail: string
  cancellationDate: Date
  livemode: boolean
}

export interface OrganizationSubscriptionCancellationScheduledNotificationEmailProps {
  organizationName: string
  subscriptionName: string
  customerId: string
  customerName: string
  customerEmail: string
  scheduledCancellationDate: Date
  livemode: boolean
}

const detailsValue = {
  color: '#141312',
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
  livemode,
}: OrganizationSubscriptionCreatedNotificationEmailProps) => {
  return (
    <EmailLayout
      previewText={`New Subscription: ${customerName} subscribed to ${subscriptionName}`}
      variant="organization"
    >
      <TestModeBanner livemode={livemode} />
      <Img
        src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
        width="40"
        height="40"
        alt="Flowglad Logo"
        style={{ marginBottom: '32px' }}
      />
      <Header
        title="New Subscription"
        variant="organization"
        style={{ fontWeight: 'normal' }}
      />
      <Paragraph
        variant="organization"
        style={{
          color: '#797063',
          margin: 0,
        }}
      >
        A new customer has subscribed to your {subscriptionName} plan.
      </Paragraph>
      <DetailSection>
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
          Customer Name
        </DetailItem>
        <Text style={detailsValue}>{customerName}</Text>
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
          Customer Email
        </DetailItem>
        <Text style={detailsValue}>{customerEmail}</Text>
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
          Subscription
        </DetailItem>
        <Text style={detailsValue}>{subscriptionName}</Text>
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
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
        variant="organization"
        style={{
          color: '#797063',
          lineHeight: '20px',
          marginTop: '24px',
        }}
      >
        {`You can manage this customer's subscription and access their information through your dashboard.`}
      </Paragraph>
      <Footer
        organizationName={organizationName}
        variant="organization"
      />
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
  livemode,
}: OrganizationSubscriptionCanceledNotificationEmailProps) => {
  return (
    <EmailLayout
      previewText={`Subscription Cancelled: ${customerName} canceled ${subscriptionName}`}
      variant="organization"
    >
      <TestModeBanner livemode={livemode} />
      <Img
        src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
        width="40"
        height="40"
        alt="Flowglad Logo"
        style={{ marginBottom: '32px' }}
      />
      <Header
        title="Subscription Cancellation Alert"
        variant="organization"
        style={{ fontWeight: 'normal' }}
      />
      <Paragraph
        variant="organization"
        style={{
          color: '#797063',
          margin: 0,
        }}
      >
        A customer has canceled their subscription to your{' '}
        {subscriptionName} plan.
      </Paragraph>
      <DetailSection>
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
          Customer Name
        </DetailItem>
        <Text style={detailsValue}>{customerName}</Text>
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
          Customer Email
        </DetailItem>
        <Text style={detailsValue}>{customerEmail}</Text>
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
          Subscription
        </DetailItem>
        <Text style={detailsValue}>{subscriptionName}</Text>
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
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
        variant="organization"
        style={{
          color: '#797063',
          lineHeight: '20px',
          marginTop: '24px',
        }}
      >
        {`You can review this customer's history and manage their account through your dashboard.`}
      </Paragraph>
      <Footer
        organizationName={organizationName}
        variant="organization"
      />
    </EmailLayout>
  )
}

export const OrganizationSubscriptionCancellationScheduledNotificationEmail =
  ({
    organizationName,
    subscriptionName,
    customerId,
    customerName,
    customerEmail,
    scheduledCancellationDate,
    livemode,
  }: OrganizationSubscriptionCancellationScheduledNotificationEmailProps) => {
    return (
      <EmailLayout
        previewText={`Cancellation Scheduled: ${customerName} scheduled cancellation for ${subscriptionName}`}
        variant="organization"
      >
        <TestModeBanner livemode={livemode} />
        <Img
          src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
          width="40"
          height="40"
          alt="Flowglad Logo"
          style={{ marginBottom: '32px' }}
        />
        <Header
          title="Subscription Cancellation Scheduled"
          variant="organization"
          style={{ fontWeight: 'normal' }}
        />
        <Paragraph
          variant="organization"
          style={{
            color: '#797063',
            margin: 0,
          }}
        >
          A customer has scheduled a cancellation for their
          subscription to your {subscriptionName} plan.
        </Paragraph>
        <DetailSection>
          <DetailItem
            style={{ color: '#797063', marginBottom: '4px' }}
          >
            Customer Name
          </DetailItem>
          <Text style={detailsValue}>{customerName}</Text>
          <DetailItem
            style={{ color: '#797063', marginBottom: '4px' }}
          >
            Customer Email
          </DetailItem>
          <Text style={detailsValue}>{customerEmail}</Text>
          <DetailItem
            style={{ color: '#797063', marginBottom: '4px' }}
          >
            Subscription
          </DetailItem>
          <Text style={detailsValue}>{subscriptionName}</Text>
          <DetailItem
            style={{ color: '#797063', marginBottom: '4px' }}
          >
            Scheduled Cancellation Date
          </DetailItem>
          <Text style={detailsValue}>
            {scheduledCancellationDate.toLocaleDateString()}
          </Text>
          <DetailItem
            style={{ color: '#797063', marginBottom: '4px' }}
          >
            Status
          </DetailItem>
          <Text style={detailsValue}>
            Active until cancellation date
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
          variant="organization"
          style={{
            color: '#797063',
            lineHeight: '20px',
            marginTop: '24px',
          }}
        >
          {`The subscription will remain active until the scheduled cancellation date. You can manage this customer's subscription through your dashboard.`}
        </Paragraph>
        <Footer
          organizationName={organizationName}
          variant="organization"
        />
      </EmailLayout>
    )
  }
