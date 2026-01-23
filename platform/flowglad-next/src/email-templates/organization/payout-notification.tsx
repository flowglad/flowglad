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

interface PayoutNotificationEmailProps {
  organizationName: string
}

export const OrganizationOnboardingCompletedNotificationEmail = ({
  organizationName,
}: PayoutNotificationEmailProps) => {
  const contactEmail = `mailto:hello@flowglad.com?subject=Payout Enablement Request&body=Hi Flowglad team,%0A%0AI would like to request payout enablement for my organization: ${encodeURIComponent(organizationName)}%0A%0AThank you!`

  return (
    <EmailLayout
      previewText={`Live payments pending review for ${organizationName}`}
      variant="organization"
    >
      <Img
        src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
        width="40"
        height="40"
        alt="Flowglad Logo"
        style={{ marginBottom: '32px' }}
      />
      <Header
        title={`Congratulations! ${organizationName} is fully onboarded`}
        variant="organization"
      />
      <Paragraph variant="organization">
        We&apos;re reviewing your account and hope to enable live
        payments for you soon. We will reach out if we need anything
        from you.
      </Paragraph>

      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <EmailButton href={contactEmail}>
          Contact Flowglad Team
        </EmailButton>
      </Section>
      <Footer
        organizationName={organizationName}
        variant="organization"
      />
    </EmailLayout>
  )
}
