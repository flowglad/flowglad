import { Img, Section } from '@react-email/components'
import * as React from 'react'
import { EmailButton } from '../components/EmailButton'
import { EmailLayout, Header, Paragraph } from '../components/themed'
import { emailBaseUrl } from '@/utils/core'

export interface OrganizationInvitationEmailProps {
  organizationName: string
  inviterName?: string
}

export const OrganizationInvitationEmail = ({
  organizationName,
  inviterName,
}: OrganizationInvitationEmailProps) => {
  const invitationLink = `${emailBaseUrl}/sign-in`
  return (
    <EmailLayout
      previewText={`You've been invited to join ${organizationName}`}
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
        title={`You've been invited to ${organizationName}`}
        variant="organization"
      />
      <Paragraph variant="organization">
        {inviterName
          ? `${inviterName} has invited you to join their organization on Flowglad.`
          : `You have been invited to join an organization on Flowglad.`}{' '}
      </Paragraph>
      <Paragraph variant="organization">
        Click the button below to accept your invitation and get
        started.
      </Paragraph>
      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <EmailButton href={invitationLink}>
          Accept Invitation
        </EmailButton>
      </Section>
      <Paragraph variant="organization" style={{ marginTop: '24px' }}>
        If you did not expect this invitation, you can safely ignore
        this email.
      </Paragraph>
    </EmailLayout>
  )
}
