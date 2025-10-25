import { Img, Section } from '@react-email/components'
import * as React from 'react'
import { EmailButton } from '../components/EmailButton'
import { EmailLayout, Header, Paragraph } from '../components/themed'

interface PayoutNotificationEmailProps {
  organizationName: string
}

export const PayoutNotificationEmail = ({ organizationName }: PayoutNotificationEmailProps) => {
  const contactEmail = `mailto:hello@flowglad.com?subject=Payout Enablement Request&body=Hi Flowglad team,%0A%0AI would like to request payout enablement for my organization: ${encodeURIComponent(organizationName)}%0A%0AThank you!`
  
  return (
    <EmailLayout
      previewText={`Enable payouts for ${organizationName}`}
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
        title={`Congratulations! ${organizationName} is fully onboarded`}
        variant="organization"
      />
      <Paragraph variant="organization">
        Your organization has completed onboarding and is nearly ready to process payments. To enable payouts, we need to manually review your account. Please contact us below to get started.
      </Paragraph>

      <Section style={{ textAlign: 'center' as const, marginTop: '32px' }}>
        <EmailButton href={contactEmail}>
          Contact Flowglad Team
        </EmailButton>
      </Section>
    </EmailLayout>
  )
}