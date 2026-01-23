import { Img, Section } from '@react-email/components'
import * as React from 'react'
import { emailBaseUrl } from '@/utils/core'
import { EmailButton } from './components/EmailButton'
import { EmailLayout, Header, Paragraph } from './components/themed'

export interface ForgotPasswordEmailProps {
  user: string
  url: string
}

export const ForgotPasswordEmail = ({
  user,
  url,
}: ForgotPasswordEmailProps) => {
  return (
    <EmailLayout
      previewText={`Reset your password, ${user}`}
      variant="customer"
    >
      <Img
        src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
        width="540"
        height="199"
        alt="Flowglad Logo"
        style={{ margin: '0 auto', marginBottom: '32px' }}
      />
      <Header title="Reset Your Password" variant="customer" />
      <Paragraph variant="customer">Hi {user},</Paragraph>
      <Paragraph variant="customer">
        We received a request to reset your password. Click the button
        below to create a new password for your account.
      </Paragraph>
      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <EmailButton href={url}>Reset Password</EmailButton>
      </Section>
      <Paragraph variant="customer" style={{ marginTop: '24px' }}>
        {`If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.`}
      </Paragraph>
      <Paragraph variant="customer">
        For security reasons, this link will expire in 24 hours.
      </Paragraph>
    </EmailLayout>
  )
}
