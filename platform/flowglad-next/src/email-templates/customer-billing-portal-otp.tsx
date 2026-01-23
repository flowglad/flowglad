import { Img, Section } from '@react-email/components'
import * as React from 'react'
import { emailBaseUrl } from '@/utils/core'
import TestModeBanner from './components/TestBanner'
import { EmailLayout, Header, Paragraph } from './components/themed'

export interface CustomerBillingPortalOTPEmailProps {
  customerName?: string
  email: string
  otp: string
  organizationName: string
  livemode: boolean
}

export const CustomerBillingPortalOTPEmail = ({
  customerName,
  email,
  otp,
  organizationName,
  livemode,
}: CustomerBillingPortalOTPEmailProps) => {
  const displayName = customerName || email

  return (
    <EmailLayout
      previewText={`Sign in to your billing portal for ${organizationName}`}
      variant="customer"
    >
      <TestModeBanner livemode={livemode} />
      <Img
        src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
        width="540"
        height="199"
        alt="Flowglad Logo"
        style={{ margin: '0 auto', marginBottom: '32px' }}
      />
      <Header
        title={'Sign In to Billing Portal'}
        variant="customer"
      />
      <Paragraph variant="customer">Hi {displayName},</Paragraph>
      <Paragraph variant="customer">
        You requested a verification code to sign in to your billing
        portal for {organizationName}.
      </Paragraph>
      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <div
          style={{
            fontSize: '32px',
            fontWeight: 'bold',
            letterSpacing: '4px',
            margin: '20px 0',
            textAlign: 'center',
            fontFamily: 'monospace',
            backgroundColor: '#f5f5f5',
            padding: '20px',
            borderRadius: '8px',
            display: 'inline-block',
          }}
        >
          {otp}
        </div>
      </Section>
      <Paragraph variant="customer" style={{ marginTop: '24px' }}>
        Enter this code to complete your request. This code will
        expire in 10 minutes.
      </Paragraph>
      <Paragraph variant="customer">
        {`If you didn't request this code, you can safely ignore this email.`}
      </Paragraph>
      <Paragraph
        variant="customer"
        style={{ fontSize: '12px', color: '#666' }}
      >
        This code was requested for: {email}
      </Paragraph>
    </EmailLayout>
  )
}
