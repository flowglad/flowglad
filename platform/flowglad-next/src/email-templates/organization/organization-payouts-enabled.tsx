import { Img, Section } from '@react-email/components'
import * as React from 'react'
import { emailBaseUrl } from '@/utils/core'
import { EmailButton } from '../components/EmailButton'
import {
  EmailLayout,
  Footer,
  Header,
  Paragraph,
} from '../components/themed'

interface OrganizationPayoutsEnabledNotificationEmailProps {
  organizationName: string
}

export const OrganizationPayoutsEnabledNotificationEmail = ({
  organizationName,
}: OrganizationPayoutsEnabledNotificationEmailProps) => {
  const dashboardLink = `${emailBaseUrl}/dashboard`

  return (
    <EmailLayout
      previewText={`Payouts have been enabled for ${organizationName}`}
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
        title={`Payouts Enabled for ${organizationName}`}
        variant="organization"
      />
      <Paragraph variant="organization">
        Great news! Payouts have been enabled for your organization.
        You can now receive payments from your customers.
      </Paragraph>
      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <EmailButton href={dashboardLink}>View Dashboard</EmailButton>
      </Section>
      <Footer
        organizationName={organizationName}
        variant="organization"
      />
    </EmailLayout>
  )
}
