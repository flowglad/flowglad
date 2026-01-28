import { Img, Section } from '@react-email/components'
import * as React from 'react'
import { emailBaseUrl } from '@/utils/core'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'
import { EmailLayout, Header, Paragraph } from './components/themed'

export interface CustomerBillingPortalMagicLinkEmailProps {
  customerName?: string
  email: string
  url: string
  organizationName: string
  livemode: boolean
}

export const CustomerBillingPortalMagicLinkEmail = ({
  customerName,
  email,
  url,
  organizationName,
  livemode,
}: CustomerBillingPortalMagicLinkEmailProps) => {
  const displayName = customerName || email

  return (
    <EmailLayout
      previewText={`Sign in to your billing portal for ${organizationName}`}
      variant="customer"
    >
      <TestModeBanner livemode={livemode} />
      <Img
        src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
        width="40"
        height="40"
        alt="Flowglad Logo"
        style={{ marginBottom: '32px' }}
      />
      <Header title="Sign In to Billing Portal" variant="customer" />
      <Paragraph variant="customer">Hi {displayName},</Paragraph>
      <Paragraph variant="customer">
        You requested a magic link to sign in to your billing portal
        for {organizationName}. Click the button below to access your
        account.
      </Paragraph>
      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <EmailButton href={url}>
          Sign In to Billing Portal
        </EmailButton>
      </Section>
      <Paragraph variant="customer" style={{ marginTop: '24px' }}>
        {`If you didn't request this sign-in link, you can safely ignore this email.`}
      </Paragraph>
      <Paragraph variant="customer">
        For security reasons, this link will expire in 10 minutes.
      </Paragraph>
      <Paragraph
        variant="customer"
        style={{ fontSize: '12px', color: '#666' }}
      >
        This link was requested for: {email}
      </Paragraph>
    </EmailLayout>
  )
}
